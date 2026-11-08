# ADR-0004: Read Prisma schemas with Prisma's own engine (`@prisma/get-dmmf`)

- **Status:** accepted
- **Date:** 2026-11-08

## Context
The used set (T1.06) needs, from base's `schema.prisma`: real database names (`@@map`, `@map`),
what `@ignore`/`@@ignore` hides, which fields are relations (no column), native types (`@db.*`),
defaults, enum names and value names (`@@map`, value `@map`), and base's unique indexes by name
(RG-DB-023). An invalid schema must fail, never produce a partial used set. `db` is pure: a string in,
data out.

All candidates were run on one test schema covering every case above, compared with Prisma 7.10.1's
own DDL for it (`migrate diff --from-empty`). The trials are in this ADR's PR history under
`spikes/parsers/`.

## Options considered
1. **`@mrleebo/prisma-ast` 0.16.0** (community, MIT). A syntax tree of exactly what's written.
   We would re-implement every Prisma rule ourselves (name mapping, ignore, relation detection, native
   type parsing, default index names) and drift from Prisma whenever it changes them. It **accepted an
   invalid schema** (`oops Strin`, an unknown type) without any error. 2.6 MB, 8 packages.
2. **`@prisma/internals` 7.10.1 `getDMMF`**. Prisma's resolved model ("DMMF"), the same engine the CLI
   uses. Async, throws on errors, a CommonJS package whose named exports don't load from ESM without a
   workaround, and Prisma's own internals package: 55 MB, 47 packages.
3. **`@prisma/get-dmmf` 7.10.1**. The small package `@prisma/internals` delegates to: the same engine
   (`@prisma/prisma-schema-wasm`), **byte-identical output** to option 2. Synchronous, returns errors as
   a value instead of throwing, accepts multi-file schemas. 3.9 MB, 6 packages.

| Case | prisma-ast | internals / get-dmmf |
|---|---|---|
| `@@map` / `@map` database names | raw attributes, we resolve | `dbName` given |
| `@ignore` / `@@ignore` | raw attributes, we filter | left out of the model |
| relation fields | must check if the type is a model | `kind: "object"` |
| `@db.VarChar(255)` | raw attribute | `["VarChar", ["255"]]`; `null` when absent |
| defaults | raw function call | structured: `{ name: "autoincrement" }`, `{ name: "dbgenerated", args }`, `"draft"` |
| enum `@@map`, value `@map` | raw attributes | `dbName` on the enum and on each value |
| unique index names | raw `map:` only | `map:` names given; **default names not given** |
| invalid schema | **accepted** | error (`P1012` with the message) |

## Decision
Use **`@prisma/get-dmmf`**, pinned to the exact Prisma version Rollback Gate supports (7.10.1 today).

## Consequences
- The used set follows Prisma's own rules for names, ignores and relations, because Prisma computes them.
  An invalid schema is rejected the same way `prisma validate` rejects it.
- It's published but not documented as a public API, so its shape can change between Prisma versions.
  We pin it exactly, upgrade it only together with the supported Prisma version and a rerun of the
  T1.05a lab, and T1.06's tests lock the exact fields we read. Fallback: option 2 (same output).
- Default unique-index names aren't in the output. T1.06 computes them as Prisma does: database names,
  `<table>_<columns joined by _>`, cut to `63 − suffix length` characters, then `_key` (unique), `_pkey`
  (primary key). Checked against Prisma's DDL, including a name past Postgres's 63-character limit
  (`AVeryLongModelNameForTestingIdentifierLimits_anotherQuiteLo_key`).
- Defaults come structured. `UsedColumn.default` stays a string (T1.02): T1.06 renders it back to
  `autoincrement()`, `dbgenerated("…")`, `"draft"`, and RG-DB-011 checks the function name.
- Enum values are stored by database name (`admin_role`, not `ADMIN`), since that's what the SQL uses.
- **An empty schema is accepted** and returns no models, which would make every drop look SAFE.
  T1.06 must treat a base schema with no models (or no PostgreSQL datasource) as an error.
- The library reads its WASM binary once, when it's imported. That's loading code, not reading input:
  `db`'s functions still take a string and return data. Loading and parsing the test schema took 0.1 s.
- Multi-file schemas (`[filename, content][]`) are supported, so the loader can later follow Prisma 7's
  schema folders.
- Apache-2.0, compatible with either license on the roadmap.

## How to defend it
"I didn't want to re-implement Prisma's naming and ignore rules and risk drifting from them, so the
used set is computed by Prisma's own engine, pinned to the version we support. It's the same output as
Prisma's internals package, at a tenth of the size, and it rejects invalid schemas, which the
syntax-only parser didn't."
