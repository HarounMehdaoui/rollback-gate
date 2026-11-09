# Tasks

One task = one branch = one PR, roughly half a day of work. A task is marked `[~]` when work on it
starts and `[x]` in its own PR. Status: `[ ]` todo · `[~]` in progress · `[x]` done.

Format for each open task: **goal**, **files**, **done when**, **learn**. A finished task shrinks to
one line: what it delivered, its PR, and where its decisions now live. The full text is in the PR.

---

## Phase 1 — DB analyzer, verdict engine, `check`

Order: foundations (T1.01–T1.04) → Prisma behaviour lab and parser decisions (T1.05a, T1.05b) → used set, SQL, history (T1.06–T1.09) →
first rule and `analyzeDb` (T1.10–T1.11), so every later rule task ends with green scenarios →
rule groups (T1.12–T1.20) → CLI (T1.21) → release (T1.22). Rule IDs and severities: `docs/RULES.md`.

### [x] T1.01 Bootstrap the monorepo
pnpm workspace (`core`, `db`, `cli`), build/test/lint/format, `ci` workflow, Node 26 and pnpm pinned (initial commit). Decisions: ARCHITECTURE §2 (purity, enforcement), CONVENTIONS "Tests" (tests are part of `tsc -b`).

### [x] T1.02 Core domain types
All core types and `assertNever` (#1). Shapes: ARCHITECTURE §3, `packages/core/src/`.

### [x] T1.03 Verdict engine
`computeVerdict`: worst wins, counts, fixed finding order (#2). Order: RULES.md §3.

### [x] T1.04 Snapshot loader + scenario runner
`loadSnapshotFromDir` and the scenario runner with `_smoke`; scenarios stay `todo` until T1.11 (#3). Behaviour: ARCHITECTURE §5 step 1, `scenarios/README.md`.

### [x] T1.05a Prisma behaviour lab
Every Prisma assumption checked by experiment on Prisma 7.10.1 / Postgres 18.6 / Node 26; new RG-DB-023 (#4). Answers and evidence: RULES.md §6; lab code in the PR's history.

### [x] T1.05b Spike + ADRs: Prisma schema parser and SQL parser
`@prisma/get-dmmf` and `libpg-query` chosen by trial; Node 26 confirmed (#5). ADR-0004, ADR-0005; spike code in the PR's history.

### [x] T1.06 Prisma snapshot → UsedSet
`buildUsedSet` with Prisma's engine; unique indexes by name in `UsedSet`. Owner's decisions: unusable base schema = tool error (exit 2); native types in Postgres's spelling (`int4`, enum name, `null` if unknown); datasource read with the engine's `get_config`; models outside `public` rejected. ARCHITECTURE §3 and §5 step 3.

### [x] T1.07 SQL parser wrapper
`parseSql` (libpg-query, ADR-0005) with statement index, character offset and text; invalid SQL is a result with its offset; `initSqlParser` loads the WASM once, and parsing before it throws. Byte offsets converted to string positions.

### [x] T1.08 Migration history diff
`diffMigrations`: new migrations in head's order (including one merged late), `EditedMigration` (`modified` / `removed`) in base's order, source `{ kind: 'migration' }`.

### [x] T1.09 Normalizer, part 1 (tables and columns)
`normalizeMigration` + one adapter per statement type in `sql/normalizers/`. Multi-action `ALTER TABLE` → one change per action; an unknown action adds one `Unrecognized` beside the known ones; inline column constraints → `AddConstraint`; identity and primary key columns count as NOT NULL; `ROLLBACK` is `Unrecognized`.

### [x] T1.10 Rule engine + drop rules
`runRules` (filters by `appliesTo`, adds `ruleId` and `source`), `dbRules`, RG-DB-001 and RG-DB-002, tested on used sets built from real schemas (`@ignore`, `@@ignore`, unknown names).

### [x] T1.11 `analyzeDb` + first scenarios
`analyzeDb` (used set → history diff → parse → normalize → rules); unusable base schema throws `UnusableBaseSchemaError` (exit 2). The runner compares every scenario; `drop-used-column`, `drop-ignored-column` and `_smoke` pass. Until T1.12, `Unparsable`, `Unrecognized` and `EditedMigration` changes have no rule.

### [x] T1.12 Rules: fail-closed and history
RG-DB-020 (UNSAFE, target = migration name), RG-DB-021 (UNSAFE, reason quotes the parser error), RG-DB-022 (RISKY, target = statement on one line, max 80 characters). Scenarios `edited-migration`, `unparsable-sql`, `unrecognized-statement`; a mixed migration reports both findings.

### [x] T1.13 Rules: renames and required columns
RG-DB-003, RG-DB-004, RG-DB-005 (UNSAFE). Scenarios `rename-used-table`, `rename-used-column`, `add-required-column`, and `prisma-field-rename` (Prisma's DROP + ADD → RG-DB-002 + RG-DB-005).

### [x] T1.14 Normalizer, part 2 (column alterations)
`AlterColumnType` (type spelled like the used set: `int4`, `varchar(50)`; `hasUsing`), `SetNotNull`, `DropNotNull`, `SetDefault`, `DropDefault`, tested on Prisma 7.10.1's verbatim `migrate diff` output. Prisma's SQL for removing `autoincrement()` is unparsable (RULES.md §6).

### [x] T1.15 Rules: nullability and defaults
RG-DB-009 and RG-DB-010 (RISKY, by base's optionality), RG-DB-011 (`autoincrement()` / `dbgenerated()` only; UNSAFE if required, RISKY if optional). Scenarios `set-not-null-optional`, `drop-not-null-required`, `drop-database-default`.

### [x] T1.16 Rules: types
`type-compat.ts` (RULES.md list; same type = no finding; what each Prisma scalar covers, `DateTime` up to `timestamp(3)`), RG-DB-006, RG-DB-007 (RISKY), RG-DB-008 (UNSAFE: unknown pair, `USING`, unresolved base type). Scenarios `narrow-varchar`, `widen-int-to-bigint`, `widen-varchar`, `unknown-type-change`.

### [x] T1.17 Normalizer, part 3 (constraints, indexes, enums, data)
New adapters `create-index`, `enums`, `data`; `drop`, `rename` and `alter-table` extended. Constraint rename → `RenameIndex`; unique expression index, `RENAME VALUE`, exclusion constraint → `Unrecognized`. Tested on Prisma 7.10.1's output; Prisma never renames an enum in place (RULES.md §6).

### [x] T1.18 Rules: constraints and enums
RG-DB-012, 013, 014, 015, 023 (RISKY) and RG-DB-017 (UNSAFE); RG-DB-023 looks the dropped name up in `usedSet.uniqueIndexes` (same table for `DROP CONSTRAINT`). One scenario each.

### [~] T1.19 Rules: data changes
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
