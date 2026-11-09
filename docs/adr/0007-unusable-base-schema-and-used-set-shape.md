# ADR-0007: An unusable base schema is a tool error; the used set keys everything by database name

- **Status:** accepted
- **Date:** 2026-11-09

## Context
T1.06 builds base's used set from `schema.prisma` with Prisma's engine (ADR-0004). Four points weren't
fixed by the spec: what an unusable base schema produces, where RG-DB-023 finds base's unique indexes,
how the engine's missing datasource information is obtained, and what happens with models outside
`public`.

## Options considered
1. **Unusable base schema** (invalid, empty, no PostgreSQL datasource):
   a. a tool error, exit `2`; b. an UNSAFE finding with a new rule ID; c. an empty used set.
2. **Unique indexes:** a. one map on `UsedSet`, keyed by index name; b. a list on each `UsedTable`.
3. **Datasource:** a. the engine's own `get_config` (`@prisma/prisma-schema-wasm`, the package
   `get-dmmf` already loads, same pinned version); b. searching the schema text.
4. **Models outside `public`:** a. reject the schema; b. skip those models.

## Decision
1a, 2a, 3a, 4a.
- Base is the release already running, so a broken base schema describes the input, not the release
  being checked. `buildUsedSet` returns `{ ok: false, error }`, `analyzeDb` throws
  `UnusableBaseSchemaError`, and `check` exits `2`. 1b would blame head for something it didn't do;
  1c would make every drop look SAFE.
- `DROP INDEX` carries only the index name, and Postgres index names are unique per schema, so
  `UsedSet.uniqueIndexes` is keyed by name (the `map:` value, or Prisma's default computed exactly).
- `get_config` reads the datasource with Prisma's own parser; a text search is fooled by comments and
  several datasources.
- Phase 1 supports only `public` (RULES.md §2). Skipping other models would fail open.

## Consequences
- `check` never prints a verdict for a base it couldn't read.
- `@prisma/prisma-schema-wasm` is a second pinned dependency, upgraded together with `get-dmmf`.
- Multi-schema Prisma projects can't be checked until a later phase adds schema support.

## How to defend it
"If the tool can't read the release it would roll back to, it has no answer, so it says so with exit
code 2 instead of guessing a verdict in either direction."
