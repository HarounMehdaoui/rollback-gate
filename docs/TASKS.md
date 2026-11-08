# Tasks

One task = one branch = one PR, roughly half a day of work. A task is marked `[~]` when work on it
starts and `[x]` in its own PR. Status: `[ ]` todo · `[~]` in progress · `[x]` done.

Format for each task: **goal**, **files**, **done when**, **learn**.

---

## Phase 1 — DB analyzer, verdict engine, `check`

Order: foundations (T1.01–T1.04) → Prisma behaviour lab and parser decisions (T1.05a, T1.05b) → used set, SQL, history (T1.06–T1.09) →
first rule and `analyzeDb` (T1.10–T1.11), so every later rule task ends with green scenarios →
rule groups (T1.12–T1.20) → CLI (T1.21) → release (T1.22). Rule IDs and severities: `docs/RULES.md`.

### [x] T1.01 Bootstrap the monorepo
- **Goal:** empty but working workspace with build, test, lint, format and CI.
- **Files:** `package.json` (with `packageManager: pnpm@12.18.0` and `engines.node: >=26`),
  `pnpm-workspace.yaml`, `.nvmrc` (`26`),
  `tsconfig.base.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`,
  `vitest.config.ts`, `.editorconfig`, `.github/workflows/ci.yml`, update `.gitignore`,
  `packages/{core,db,cli}/package.json` + `tsconfig.json` + `src/index.ts` + one test
- **Decision (D7): test files are part of `tsc -b`.** Why: Vitest strips types without checking them,
  so without this a test with a type error still passes. One compiler and one command (`pnpm build`)
  checks everything, and the T1.02 `@ts-expect-error` test only means something if tests are
  type-checked. Vitest's typecheck mode would be a second, separately configured checker.
- **Done when:**
  - `pnpm build`, `pnpm test` (one dummy test per package), `pnpm lint`, `pnpm format` all work
    locally and in CI
  - Node 26 (current LTS) and pnpm 12.18.0 are pinned (`.nvmrc`, `engines`, `packageManager`) and CI
    reads them from those files, not from hard-coded versions in the workflow
  - the CI workflow's job is named `ci` (branch protection requires that name)
  - ESLint is type-aware (needed for `switch-exhaustiveness-check`)
  - a type error in a test file fails `pnpm build`
  - purity rules work: importing `node:fs`, or using `process.env` or `Date.now()`, in `core` or `db`
    fails `pnpm lint`; importing `@rollbackgate/cli` from `db` fails `pnpm lint` (checked by hand,
    then removed)
- **Learn:** pnpm workspaces, TS project references (`tsc -b`), ESLint flat config.

### [x] T1.02 Core domain types
- **Goal:** `Severity`, `FindingSeverity`, `Snapshot`, `MigrationFile`, `UsedSet` (+ `UsedTable`,
  `UsedColumn`, `UsedEnum`), `Change` (every kind in ARCHITECTURE §3), `SourcedChange`,
  `FindingSource`, `Finding`, `Rule`, `RuleContext`, `Analyzer`, `Verdict`, `assertNever`.
- **Files:** `packages/core/src/{severity,snapshot,used-set,change,finding,rule,rule-id,analyzer,verdict,assert-never}.ts`, `index.ts`
- **Done when:** types compile; a test proves an exhaustive `switch` over `Change['kind']` fails to
  compile if a kind is missing (`@ts-expect-error`).
- **Learn:** discriminated unions, `never` exhaustiveness checks, `Exclude<>`.

### [x] T1.03 Verdict engine
- **Goal:** `computeVerdict(findings) → Verdict` (worst wins, no findings = SAFE, counts, stable sort).
- **Files:** `packages/core/src/verdict-engine.ts` + `.test.ts`
- **Done when:** tests cover the empty list (SAFE), mixed severities, sort order (UNSAFE first, then
  source order), and sources of each kind (statement, migration, release).
- **Learn:** writing tests first; pure functions.

### [x] T1.04 Snapshot loader + scenario runner
- **Goal:** `loadSnapshotFromDir(dir) → Snapshot` (reads `prisma/schema.prisma` and
  `prisma/migrations/*/migration.sql`, computes sha256), and one Vitest file that discovers
  `scenarios/*/` and compares results with `expected.json`.
- **Files:** `packages/cli/src/load-snapshot-dir.ts` + test, `scenarios/_smoke/{base,head,expected.json}`,
  `packages/cli/test/{scenarios.test,scenario-files,scenario-files.test}.ts`, `packages/cli/test/tsconfig.json`
- **Done when:** the loader is tested on `_smoke`; the runner discovers scenarios and marks them
  `todo` until T1.11 gives it `analyzeDb`.
- **Learn:** data-driven tests (`test.each`); keeping I/O at the edge (the loader is the only part
  that touches files).

### [~] T1.05a Prisma behaviour lab
- **Goal:** replace guesses with evidence before any rule is built. A throwaway Prisma project under
  `spikes/prisma-lab/` against Postgres in Docker answers all 12 ⚠️ items in `docs/RULES.md` §6
  **by experiment**: generate migrations with `prisma migrate dev`, run queries, read the query log
  and error messages. Record each answer and its evidence in §6, then adjust the affected rules and
  remove their ⚠️ markers. Also confirm the chosen Prisma version runs on Node 26.
- **Versions:** Prisma 7.10.1 (latest stable; 8.0 is still a release candidate), Postgres 18.6.
- **Files:** `docs/RULES.md` (§6 + affected rules). `spikes/prisma-lab/` is committed on the branch
  for the record but removed before the PR is merged.
- **Done when:** every row in RULES.md §6 has an answer and evidence; no ⚠️ marker is left in RULES.md;
  Prisma is confirmed on Node 26 (or the fallback to Node 24 is recorded).
- **Learn:** how to run a technical spike, and why evidence beats documentation for edge-case behaviour.

### [ ] T1.05b Spike + ADRs: Prisma schema parser and SQL parser
- **Goal:** choose both parsers with evidence.
  - **ADR-0004 Prisma schema parser:** try ≥ 2 candidates on a schema with `@map`, `@@map`,
    `@ignore`, `@@ignore`, `@db.*` native types, `@default`s, enums and relations.
  - **ADR-0005 SQL parser:** libpg-query native vs WASM build, which Postgres grammar version it
    ships, sync vs async API, install and CI impact. Confirm it runs on Node 26; if not, fall back
    to Node 24 (LTS), update T1.01's pins, and record why.
- **Files:** `docs/adr/0004-prisma-schema-parser.md`, `docs/adr/0005-sql-parser.md` (throwaway spike
  code stays on the branch, not merged)
- **Done when:** both ADRs record options, test results, decision and consequences; the Node version
  is confirmed for libpg-query.
- **Learn:** comparing libraries on your own test cases instead of their READMEs.

### [ ] T1.06 Prisma snapshot → UsedSet
- **Goal:** `buildUsedSet(schemaText) → UsedSet` with real DB names, ignoring `@ignore`/`@@ignore`.
  Each column records Prisma scalar, native type (`@db.*` or the scalar's default), optionality,
  list, default and enum (RULES.md §2).
- **Files:** `packages/db/src/prisma/{parse-schema,used-set}.ts` + tests
- **Done when:** tests cover `@map`, `@@map`, `@ignore`, `@@ignore`, relation fields (no column),
  `@id`, enums (incl. `@@map` on enums), `@db.*` types and default native types.
- **Learn:** the difference between Prisma model names and database names.

### [ ] T1.07 SQL parser wrapper
- **Goal:** `parseSql(sql) → { ok: true, statements } | { ok: false, error }` around libpg-query.
- **Files:** `packages/db/src/sql/parse-sql.ts` + test
- **Done when:** valid multi-statement SQL parses; invalid SQL returns an error, never throws.
- **Learn:** use the API recorded in ADR-0005; don't guess.

### [ ] T1.08 Migration history diff
- **Goal:** `diffMigrations(base, head) → { newMigrations, changes }`. New = in head, not in base.
  Same name with a different sha256 → `EditedMigration` (`modified`); in base but missing from head →
  `EditedMigration` (`removed`). Both have source `{ kind: 'migration' }`.
- **Files:** `packages/db/src/migrations/diff-migrations.ts` + tests
- **Done when:** tests cover new, unchanged, modified, removed, and the order of new migrations.

### [ ] T1.09 Normalizer, part 1 (tables and columns)
- **Goal:** AST → `SourcedChange[]` for `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE … DROP COLUMN`,
  `ADD COLUMN`, `RENAME COLUMN`, `RENAME TO` (table). `BEGIN`/`COMMIT` → nothing. Unknown statements →
  `Unrecognized`. Statements on a schema other than `public` → `Unrecognized`.
- **Files:** `packages/db/src/sql/normalize.ts`, `packages/db/src/sql/normalizers/*.ts` + tests
- **Done when:** each statement type has a test; quoted identifiers, unquoted (lower-cased) identifiers
  and `"public".` prefixes are handled.
- **Learn:** reading a Postgres AST; the adapter pattern.

### [ ] T1.10 Rule engine + drop rules
- **Goal:** `runRules(sourcedChanges, ctx, rules) → Finding[]` (adds `ruleId` and `source`);
  RG-DB-001 drop table, RG-DB-002 drop column.
- **Files:** `packages/db/src/rules/{index,run-rules,drop-table,drop-column}.ts` + tests
- **Done when:** unit tests pass for used and unused (`@ignore`, `@@ignore`, unknown) tables and columns.

### [ ] T1.11 `analyzeDb` + first scenarios
- **Goal:** pure `analyzeDb(base, head): Finding[]` in `db`: used set → history diff → parse →
  normalize (parse failure → `Unparsable`) → rules. The scenario runner calls it directly.
- **Files:** `packages/db/src/analyze-db.ts` + test, `packages/cli/test/scenarios.test.ts` (wired),
  `scenarios/drop-used-column/`, `scenarios/drop-ignored-column/`
- **Done when:** both scenarios pass; `_smoke` passes as SAFE. From here on, every rule task ends with
  green scenarios.
- **Learn:** composing pure functions into a pipeline.

### [ ] T1.12 Rules: fail-closed and history
- **Goal:** RG-DB-020 edited/removed migration, RG-DB-021 unparsable SQL, RG-DB-022 unrecognized
  statement.
- **Files:** one rule file each + tests + scenarios `edited-migration`, `unparsable-sql`,
  `unrecognized-statement`
- **Done when:** fail-closed behaviour has explicit tests, including a migration that mixes a valid
  statement with an unrecognized one.

### [ ] T1.13 Rules: renames and required columns
- **Goal:** RG-DB-003 rename table, RG-DB-004 rename column, RG-DB-005 required column added.
- **Files:** one rule file each + tests + one scenario each

### [ ] T1.14 Normalizer, part 2 (column alterations)
- **Goal:** `ALTER COLUMN … TYPE` (with/without `USING`), `SET/DROP NOT NULL`, `SET/DROP DEFAULT`.
- **Files:** more files in `packages/db/src/sql/normalizers/` + tests
- **Done when:** real `prisma migrate diff` output for each case normalizes correctly (copied into
  fixtures).

### [ ] T1.15 Rules: nullability and defaults
- **Goal:** RG-DB-009 set NOT NULL, RG-DB-010 drop NOT NULL, RG-DB-011 drop default.
- **Files:** one rule file each + tests + one scenario each
- **Done when:** the rules use the T1.05a lab answers (RULES.md §6, rows 4 and 5).

### [ ] T1.16 Rules: types
- **Goal:** type compatibility table (Postgres type normalization, known widenings) + RG-DB-006
  narrowing, RG-DB-007 widening across Prisma scalars, RG-DB-008 unknown type change.
- **Files:** `packages/db/src/rules/type-compat.ts`, one rule file each + tests + scenarios
- **Done when:** an unknown pair and an unresolvable base type both give UNSAFE (fail-closed test).

### [ ] T1.17 Normalizer, part 3 (constraints, indexes, enums, data)
- **Goal:** `ADD CONSTRAINT` (unique, primary key, check, FK), `DROP CONSTRAINT`,
  `CREATE [UNIQUE] INDEX`, `DROP INDEX`, `ALTER INDEX … RENAME`, `RENAME CONSTRAINT`,
  `CREATE TYPE … AS ENUM`, `ALTER TYPE … ADD VALUE`, `ALTER TYPE … RENAME TO`, `DROP TYPE`, `UPDATE`,
  `DELETE`, `TRUNCATE`.
- **Files:** more files in `packages/db/src/sql/normalizers/` + tests
- **Done when:** real `prisma migrate diff` output for each case normalizes correctly.

### [ ] T1.18 Rules: constraints and enums
- **Goal:** RG-DB-012 unique / primary key, RG-DB-013 check, RG-DB-014 foreign key,
  RG-DB-015 enum value added, RG-DB-017 enum renamed.
- **Files:** one rule file each + tests + one scenario each

### [ ] T1.19 Rules: data changes
- **Goal:** RG-DB-018 rows updated (with the backfill exception), RG-DB-019 rows deleted.
- **Files:** one rule file each + tests + scenarios `backfill-new-column`, `update-used-column`,
  `delete-rows`
- **Done when:** the backfill exception has its own scenario (SAFE).

### [ ] T1.20 Enum value removal (multi-statement pattern) + ADR-0006
- **Goal:** recognize Prisma's enum recreate sequence and replace its statements with one
  `RemoveEnumValue` change per removed value; RG-DB-016.
- **Files:** `docs/adr/0006-multi-statement-patterns.md`,
  `packages/db/src/sql/patterns/enum-recreate.ts`, `rules/remove-enum-value.ts` + tests + scenario
- **Done when:** the ADR records how patterns are matched (where in the pipeline, what happens on a
  partial match: it must fail closed), and real Prisma output for removing an enum value gives
  exactly RG-DB-016.
- **Learn:** why "one statement → one change" breaks down, and how to extend a pipeline safely.

### [ ] T1.21 `check` command
- **Goal:** `rollbackgate check --base <ref> --head <ref|worktree> [--format text|json]`.
  Loads snapshots from git (or the working tree via T1.04's loader), runs `analyzeDb`, computes the
  verdict, prints, exits `0` (SAFE/RISKY), `1` (UNSAFE) or `2` (tool error).
- **Files:** `packages/cli/src/{main,commands/check,load-snapshot-git,format-text,format-json}.ts` + tests
- **Done when:** exit codes are tested, including `2` for a bad ref; text output matches the README
  example's format.
- **Learn:** keeping I/O at the edge; exit codes as a CI contract.

### [ ] T1.22 Rename walkthrough + release v0.1.0
- **Goal:** scenarios `rename-r1-expand` … `rename-r4-contract` give SAFE, RISKY, SAFE, SAFE
  (RULES.md §5). README example matches real output. CHANGELOG entry. Tag `v0.1.0`.
- **Done when:** a fresh clone can run the quick start from the README.

---

## Phase 2+

Not planned in detail yet. Each phase is split into tasks once the previous phase is done.
