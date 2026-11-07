# Architecture

## 1. Big picture

```text
           ┌──────────── pure (no I/O) ────────────┐
 git/fs ─► │ Snapshot(base)  Snapshot(head)         │
 (cli)     │      │               │                 │
           │      ▼               ▼                 │
           │  UsedSet       Change[] (normalized)   │
           │      └──────┬────────┘                 │
           │             ▼                          │
           │        rules → Finding[]               │
           │             ▼                          │
           │        verdict engine → Verdict        │
           └─────────────┬──────────────────────────┘
                         ▼
        rehearsal (raise-only) → attest (cosign) → enforce (Kyverno / verify-deploy)
```

## 2. Packages (pnpm workspaces)

| Package | Pure? | Responsibility | Phase |
|---|---|---|---|
| `packages/core` | yes | Domain types (`Snapshot`, `Change`, `UsedSet`, `Finding`, `Severity`, `Verdict`), `Rule` and `Analyzer` interfaces, verdict engine | 1 |
| `packages/db` | yes | Builds the `UsedSet` from Prisma schema; SQL → AST → `Change[]`; DB rules; `analyzeDb` | 1 |
| `packages/config` | yes | Env contract extraction + config rules | 2 |
| `packages/rehearsal` | no | Temp Postgres, boot images, smoke requests | 2 |
| `packages/attest` | no | Build in-toto statement, call cosign, verify | 4 |
| `packages/cli` | no | Arg parsing, git/fs loading, output formatting, exit codes | 1+ |
| `policies/` | — | Kyverno policy, kind demo manifests | 5 |
| `scenarios/` | — | Test fixtures: `base/`, `head/`, `expected.json` | 1+ |
| `examples/demo-app` | — | NestJS + Prisma + Postgres demo | 6 |

**Dependency rule:** `cli → db | config | rehearsal | attest → core`. Nothing imports `cli`.

**Enforcement: ESLint only** (no dependency-cruiser), configured per package in `eslint.config.js`:
- `no-restricted-imports`: pure packages (`core`, `db`, `config`) can't import Node I/O modules
  (`fs`, `child_process`, `net`, `http`, …, with or without the `node:` prefix). `core` can't import
  any other workspace package. No package can import `cli`.
- `no-restricted-globals`: pure packages can't use `process`, `Date`, `fetch`, `setTimeout`,
  `setInterval`, `setImmediate`.
- `no-restricted-properties`: pure packages can't use `Math.random`.
- pnpm's strict `node_modules` blocks imports of workspace packages a package doesn't declare in its
  `package.json`, which backs up the direction rule.
- The compiler adds a second layer: pure packages set `"types": []` in their `tsconfig.json`, so Node's
  types aren't loaded and `process` or `node:fs` don't even compile there. Only `cli` loads them.

**Why this split:** the risky logic (rules) is pure and therefore cheap to test exhaustively with
scenario folders. Everything slow or flaky (git, Docker, cosign) sits at the edges and is tested less
often, mostly end to end.

## 3. Core types (sketch, final shapes decided in T1.02)

```ts
type Severity = 'SAFE' | 'RISKY' | 'UNSAFE';
type FindingSeverity = Exclude<Severity, 'SAFE'>;   // rules never emit SAFE (see RULES.md §3)

interface Snapshot {
  ref: string;                       // git ref or digest it was built from
  prismaSchema: string;              // raw schema.prisma text
  migrations: MigrationFile[];       // { name, sql, sha256 } in apply order
  envContract?: EnvContract;         // Phase 2
}

// What base's code can touch. Type lives in core (rules need it); db builds it.
interface UsedSet {
  tables: ReadonlyMap<string, UsedTable>;      // key: real DB table name (@@map resolved)
  enums: ReadonlyMap<string, UsedEnum>;        // key: real DB enum name
}
interface UsedTable { model: string; columns: ReadonlyMap<string, UsedColumn> }  // key: DB column name
interface UsedColumn {
  field: string;                     // Prisma field name
  prismaType: string;                // 'String' | 'Int' | … | an enum name
  nativeType: string;                // '@db.*' type, or Prisma's default native type for the scalar
  isOptional: boolean;
  isList: boolean;
  default?: string;                  // raw @default(...) expression
  enumName?: string;
}
interface UsedEnum { values: readonly string[] }

// Full list and the rule for each kind: docs/RULES.md.
type Change =
  // tables
  | { kind: 'CreateTable'; table: string }
  | { kind: 'DropTable'; table: string }
  | { kind: 'RenameTable'; from: string; to: string }
  // columns
  | { kind: 'AddColumn'; table: string; column: string; isNullable: boolean; hasDefault: boolean }
  | { kind: 'DropColumn'; table: string; column: string }
  | { kind: 'RenameColumn'; table: string; from: string; to: string }
  | { kind: 'AlterColumnType'; table: string; column: string; toType: string; hasUsing: boolean }
  | { kind: 'SetNotNull' | 'DropNotNull' | 'SetDefault' | 'DropDefault'; table: string; column: string }
  // constraints and indexes
  | { kind: 'AddConstraint'; table: string; name?: string;
      constraint: 'unique' | 'primaryKey' | 'check' | 'foreignKey'; columns: readonly string[] }
  | { kind: 'DropConstraint'; table: string; name: string }
  | { kind: 'CreateIndex' | 'CreateUniqueIndex'; table: string; name?: string; columns: readonly string[] }
  | { kind: 'DropIndex'; name: string }
  | { kind: 'RenameIndex'; from: string; to: string }
  // enums
  | { kind: 'CreateEnum'; enumName: string; values: readonly string[] }
  | { kind: 'AddEnumValue' | 'RemoveEnumValue'; enumName: string; value: string }
  | { kind: 'RenameEnum'; from: string; to: string }
  | { kind: 'DropEnum'; enumName: string }
  // data
  | { kind: 'UpdateRows'; table: string; columns: readonly string[] }
  | { kind: 'DeleteRows'; table: string }                       // DELETE and TRUNCATE
  // migration history
  | { kind: 'EditedMigration'; migration: string; edit: 'modified' | 'removed' }
  // fail-closed
  | { kind: 'Unparsable'; sql: string; error: string }
  | { kind: 'Unrecognized'; sql: string };

// AlterColumnType has no "from": the SQL doesn't contain it. Type rules read it from the used set.
// RemoveEnumValue comes only from the multi-statement recognizer (ADR-0006, T1.20).

type FindingSource =
  | { kind: 'statement'; migration: string; statementIndex: number }
  | { kind: 'migration'; migration: string }     // EditedMigration, Unparsable (whole file)
  | { kind: 'release' };                         // config (RG-CFG-*), rehearsal (RG-RH-*)

interface Finding {
  ruleId: string;                // 'RG-DB-002'
  severity: FindingSeverity;
  target: string;                // '"User"."name"'
  reason: string;
  fix: string;
  source: FindingSource;
}

interface SourcedChange { change: Change; source: FindingSource }   // what the normalizer returns

interface RuleContext { usedSet: UsedSet }      // built from base

interface Rule {
  id: string;
  appliesTo: readonly Change['kind'][];
  // The engine adds ruleId and source, so rules don't need to know where a change came from.
  evaluate(change: Change, ctx: RuleContext): readonly Omit<Finding, 'ruleId' | 'source'>[];
}

type Analyzer = (base: Snapshot, head: Snapshot) => Finding[];   // analyzeDb, later analyzeConfig

interface Verdict {
  verdict: Severity;                                  // worst finding, or SAFE when there are none
  findings: readonly Finding[];                       // sorted: UNSAFE first, then source order
  counts: { unsafe: number; risky: number };
}
```

## 4. Base resolution: PR mode vs release mode

| Mode | Base is | Result is |
|---|---|---|
| PR mode | last release tag | **advisory** — early feedback, CI fails on UNSAFE |
| Release mode | the digest actually deployed in the target environment, mapped to its git commit via OCI labels / build provenance | **authoritative** — this is what gets attested |

Why: several PRs can each be SAFE alone and UNSAFE together, and the last tag is not always what is
running. See [ADR-0001](adr/0001-release-mode-against-deployed-base.md).

## 5. Phase 1 data flow (`check`)

1. **Load (cli):** read base and head snapshots from git (`git show <ref>:path`) or from a directory
   (the working tree, or a scenario fixture).
2. **Analyze (db, pure):** `analyzeDb(base, head)` runs steps 3–7 and returns `Finding[]`.
3. **Used set:** parse base `schema.prisma`; collect tables, columns and enums not marked
   `@ignore`/`@@ignore`; resolve `@map`/`@@map` to real names; record each column's type (Prisma
   scalar + native type), optionality, default and enum.
4. **Migration history diff:** new migrations = in head but not in base. A migration in base that is
   missing from head, or has a different sha256, produces an `EditedMigration` change.
5. **Normalize:** parse each new migration with libpg-query. If the file fails to parse → one
   `Unparsable` change for the whole migration. Otherwise map each statement to zero or more
   `Change`s (`BEGIN`/`COMMIT` produce none). Parsed but not mapped → `Unrecognized`. Then
   multi-statement patterns (Prisma's enum recreate) are recognized (ADR-0006, T1.20).
6. **Rules:** run every rule whose `appliesTo` matches, with the used set as context. Rules emit only
   RISKY or UNSAFE findings. The backfill exception needs no extra context: columns added in this
   release are never in base's used set (RULES.md, RG-DB-018).
7. **Verdict (core):** `computeVerdict(findings)`. Worst severity wins, no findings = SAFE; findings
   sorted by severity, then source order.
8. **Output (cli):** human text or `--format json`. Exit codes: `0` = SAFE or RISKY, `1` = UNSAFE,
   `2` = tool error.

## 6. Rehearsal (Phase 2)

1. Start temp Postgres. 2. Apply **base** migrations, load seed. 3. Apply **head** migrations.
4. Boot **head** image, run head smoke (writes new-style data). 5. Stop it.
6. Boot **base** image with **head** config; run base healthcheck and smoke (reads those rows, writes).

Failure → UNSAFE finding `RG-RH-001` with source `{ kind: 'release' }`. Pass → no change. The rehearsal **never lowers** a static
verdict. See [ADR-0002](adr/0002-rehearsal-write-then-read-raise-only.md).

## 7. Attestation (Phase 4)

in-toto statement, subject = head image digest, predicate type `https://rollbackgate.dev/verdict/v1`:

```json
{
  "verdict": "RISKY",
  "base":  { "digest": "sha256:…", "commit": "…" },
  "head":  { "commit": "…" },
  "findings": [ { "ruleId": "RG-DB-007", "severity": "RISKY", "target": "…" } ],
  "rehearsal": { "status": "passed" },
  "override": null,
  "tool": { "name": "rollbackgate", "version": "0.4.0" }
}
```

Signed with keyless cosign from the release workflow on `main`. See
[ADR-0003](adr/0003-keyless-signing.md).

## 8. Enforcement (Phase 5)

- **Kubernetes:** Kyverno `verifyImages` requires the attestation, signed by the expected workflow
  identity, with `verdict ∈ {SAFE, RISKY}`, or `UNSAFE` with an `override` (PR label
  `rollback-unsafe-approved` + non-empty "Rollback plan"; see [RULES.md §3](RULES.md#3-severity-policy)).
- **Baseline check:** the deploy step checks `predicate.base.digest == currently running digest`.
  Mismatch → stale verdict → recompute.
- **Docker hosts:** `rollbackgate verify-deploy` runs the same checks before `docker compose up`.
- **Rollback itself:** redeploying N-1 is admitted because it has its own valid attestation. The gate
  doesn't judge rollbacks; it refuses to deploy anything you couldn't undo.

## 9. Testing strategy

| Level | What | Where |
|---|---|---|
| Unit | each rule, normalizer, prisma parser, verdict engine | `packages/*/src/**/*.test.ts` |
| Scenario | `analyzeDb` on fixture folders (loaded by the cli's directory loader) | `scenarios/<name>/{base,head,expected.json}` + one runner |
| E2E | rehearsal, attest, Kyverno on kind | `e2e/` (Phase 2+), run in CI only |

## 10. Rules every change must follow

The short list a reviewer checks every PR against. The details are in the sections above.

1. **Pure packages.** `core`, `db` and `config` do no I/O: no `fs`, `child_process`, `process.env`,
   network, git, Docker, cosign, clock or randomness. Input is snapshots, output is data (§2).
2. **Analyzer shape.** An analyzer is `(base: Snapshot, head: Snapshot) => Finding[]` (§3).
3. **Normalize first.** SQL is normalized into `Change[]` before any rule runs. Rules never see raw
   SQL or the AST (§5).
4. **One rule per file**, with the stable ID, severity, reason and fix from
   [RULES.md](RULES.md). Rules emit only RISKY or UNSAFE findings; no findings = SAFE.
5. **Fail-closed.** Unparsable SQL → UNSAFE; unknown type change → UNSAFE; parsed but unrecognized →
   RISKY ([RULES.md §3](RULES.md#3-severity-policy)).
6. **Raise-only rehearsal.** The rehearsal can add findings, never remove or lower them (§6,
   [ADR-0002](adr/0002-rehearsal-write-then-read-raise-only.md)).
7. **I/O at the edges.** I/O lives only in `cli`, `rehearsal` and `attest`.
8. **Dependency direction.** `cli → db | config | rehearsal | attest → core`; nothing imports `cli`.
   Rules 1 and 8 are enforced by ESLint and the compiler (§2).

Exit codes of the CLI: `0` = SAFE or RISKY, `1` = UNSAFE, `2` = tool error.
