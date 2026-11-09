# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Project specification, architecture, roadmap, task plan and development workflow.
- Rules catalogue (`docs/RULES.md`): 22 DB rules, reserved config and rehearsal rules, severity and
  override policy, 4-release rename walkthrough.
- Glossary (`docs/GLOSSARY.md`).
- Monorepo bootstrap (T1.01): pnpm workspace with `core`, `db` and `cli`, TypeScript project
  references, Vitest, ESLint purity and dependency-direction rules, Prettier, and the `ci` workflow,
  with Node 26 and pnpm 12.18.0 pinned.
- Core domain types (T1.02): the `Change` union (one variant per kind), findings and their sources,
  rules, analyzer and verdict types, `RuleId` format, and `assertNever` for exhaustive switches.
- Verdict engine (T1.03): `computeVerdict` (worst severity wins, no findings = SAFE) with counts and
  a fixed finding order, so the same findings always give the same report.
- Snapshot loader and scenario runner (T1.04): `loadSnapshotFromDir` reads a release folder into a
  snapshot; one test file turns every `scenarios/` folder into tests, with the `_smoke` fixture.
- Prisma behaviour lab results (T1.05a): every Prisma assumption in the rules catalogue checked by
  experiment against Prisma 7.10.1 and Postgres 18.6; new rule RG-DB-023 (unique index dropped that
  base relies on, RISKY).
- Parser decisions (T1.05b): ADR-0004 (`@prisma/get-dmmf` for Prisma schemas) and ADR-0005
  (`libpg-query` for migration SQL), each chosen by running the candidates on our own cases.
- Used set (T1.06): `buildUsedSet` reads base's `schema.prisma` with Prisma's engine into tables,
  columns, enums and unique indexes by database name; unusable schemas are errors, never empty.
- SQL parser wrapper (T1.07): `parseSql` reads migration SQL with Postgres's own grammar; invalid SQL
  is reported with its position instead of crashing.
- Migration history diff (T1.08): `diffMigrations` finds the migrations a release adds and the
  already-applied ones it edited or removed.
- Normalizer, part 1 (T1.09): table and column statements become changes, one per action; anything
  not modelled, or outside the `public` schema, becomes `Unrecognized`.
- Rule engine and first rules (T1.10): `runRules`; RG-DB-001 (table dropped) and RG-DB-002 (column
  dropped), UNSAFE when base uses them.
- DB analyzer (T1.11): `analyzeDb` runs the whole pipeline on two snapshots; the scenario runner checks
  every scenario end to end (`drop-used-column`, `drop-ignored-column`).
- Fail-closed rules (T1.12): RG-DB-020 (applied migration edited or removed) and RG-DB-021
  (unparsable SQL) are UNSAFE; RG-DB-022 (statement not modelled) is RISKY.
- Rename and required-column rules (T1.13): RG-DB-003 (table renamed), RG-DB-004 (column renamed) and
  RG-DB-005 (NOT NULL column without default added), UNSAFE when base uses the table.
- Normalizer, part 2 (T1.14): column type, NOT NULL and default alterations become changes, checked
  against Prisma 7.10.1's real output.
- Nullability and default rules (T1.15): RG-DB-009 (NOT NULL set), RG-DB-010 (NOT NULL dropped) and
  RG-DB-011 (database default dropped).
- Type rules (T1.16): RG-DB-006 (narrowing), RG-DB-007 (widening beyond base's Prisma type) and
  RG-DB-008 (unknown type change, UNSAFE), from an explicit list of known widenings.
- Normalizer, part 3 (T1.17): constraints, indexes, enums and data statements (`UPDATE`, `DELETE`,
  `TRUNCATE`) become changes, checked against Prisma 7.10.1's real output.
- Constraint and enum rules (T1.18): RG-DB-012 (unique), 013 (CHECK), 014 (foreign key), 015 (enum
  value added), 023 (unique index dropped) are RISKY; RG-DB-017 (enum renamed) is UNSAFE.
- Data rules (T1.19): RG-DB-018 (used column rewritten) and RG-DB-019 (rows deleted), RISKY; a
  backfill of a column added in the same release is SAFE.
- Enum value removal (T1.20): ADR-0006; Prisma's enum recreate sequence is recognized as RG-DB-016
  (RISKY), and any partial sequence stays UNSAFE.
- `check` command (T1.21): `rollbackgate check --base <ref> --head <ref|worktree> [--format text|json]`
  reads both releases from git (or the working tree), prints the verdict and exits 0, 1 or 2.

### Changed
- RG-DB-011 now applies only to `autoincrement()` and `dbgenerated()` defaults: Prisma 7 sends every
  other default itself. The `_smoke` scenario schemas are valid for Prisma 7.
- Git workflow: squash-only auto-merge, ruleset on `main` (PR + up-to-date `ci`, no bypass), no
  stacked PRs, small doc fixes ride along in the next task's PR.
- ADRs renumbered from 0010–0012 to 0001–0003.
- Phase 1 tasks reordered and split so every rule task ends with passing scenarios.
- Architecture types: full `Change` union, `UsedSet` in core, `Finding.source` union, `Analyzer` type.
- Severity principle: UNSAFE only when base will certainly break; RISKY when it breaks only for some
  values (RG-DB-006, 009, 016 lowered to RISKY).
- T1.05 becomes a Prisma behaviour lab that answers the open questions by experiment; Node 26 pinned.
