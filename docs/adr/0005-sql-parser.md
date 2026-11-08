# ADR-0005: Parse migration SQL with Postgres's own parser (`libpg-query`)

- **Status:** proposed
- **Date:** 2026-11-08

## Context
Every rule depends on reading migration SQL correctly. Fail-closed makes the parser's mistakes
expensive both ways: if it rejects valid SQL, the release is reported UNSAFE (RG-DB-021); if it accepts
SQL Postgres would reject, it can report SAFE for nonsense. The parser must handle real Prisma output
(including the enum recreate sequence and multi-action `ALTER TABLE`), give each statement's position
(for `statementIndex`), return errors without crashing, run on Node 26, and install on CI without a
compiler.

All candidates ran on the T1.05a lab's real Prisma SQL, plus a `DO $$ … $$` block, a typo, and
Postgres 17+ syntax (`ALTER COLUMN … SET EXPRESSION`). The trials are in this ADR's PR history under
`spikes/parsers/`.

## Options considered
1. **`libpg-query` 18.2.2** (MIT). Postgres's own parser compiled to WebAssembly; reports grammar
   version `180004` (Postgres 18.4). 1.9 MB, 2 packages, no install script.
2. **`pgsql-parser` 18.3.3**. Re-exports `libpg-query`'s parser (it pinned 18.2.1) plus a deparser
   (AST back to SQL) we don't need. 3.0 MB, 5 packages.
3. **`node-sql-parser` 5.4.0** (Apache-2.0). A JavaScript grammar for many SQL dialects. 89 MB.

| Input | libpg-query | node-sql-parser |
|---|---|---|
| Prisma enum recreate (`BEGIN`…`COMMIT`, 9 statements) | ✅ | ❌ fails |
| Prisma index / constraint renames | ✅ | ❌ fails |
| multi-action `ALTER TABLE … DROP COLUMN …, ADD COLUMN …` | ✅ one statement, `[AT_DropColumn, AT_AddColumn]` | ✅ |
| `CREATE SCHEMA` + tables + indexes + FK | ✅ 10 statements | ✅ |
| `DO $$ … $$` | ✅ `DoStmt` | ❌ fails |
| `SET EXPRESSION` (Postgres 17+) | ✅ | ❌ fails |
| typo (`ADD COLUMNN`) | `SqlError` with cursor position | rejected |
| statement positions | `stmt_location`, `stmt_len` | none in the AST we used |

## Decision
Use **`libpg-query`**, pinned exactly (18.2.2), with `parseSync` after a one-time `loadModule()`.

## Consequences
- The SQL is read by the same grammar Postgres uses, so "unparsable" means Postgres would reject it too.
  The grammar version is the package's major version (18 = Postgres 18). Upgrading it is a deliberate PR.
- No native build: it's WebAssembly only, with no install script, so CI and Node 26 need nothing extra.
- **`parseSync` throws "WASM module not initialized" until `loadModule()` has finished** (7 ms, once).
  To keep `Analyzer` synchronous and pure, the cli (and the scenario runner) awaits a one-time
  initialization before analyzing; T1.07 provides it next to `parseSql`. Calling the parser without it
  is a programmer error (tool error, exit 2), not a finding.
- `stmt_location` / `stmt_len` give each statement's place in the file. The first statement can omit
  `stmt_location` (meaning 0).
- A multi-action `ALTER TABLE` arrives as one statement with several `cmds`: the normalizer (T1.09) emits
  one change per command.
- A `DO` block arrives as `DoStmt` with its body as a string: it becomes `Unrecognized` (RISKY). Reading
  inside it (`parsePlPgSQLSync`) is out of scope.
- Errors are a `SqlError` with a cursor position, which `parseSql` turns into an `Unparsable` change with
  a readable message.
- Parsing is fast: 1,000 parses of a 10-statement migration took 118 ms.

## How to defend it
"A JavaScript SQL grammar failed on Prisma's own output, which would have made normal migrations look
unparsable and UNSAFE. So we use Postgres's actual parser, compiled to WebAssembly: what it accepts is
exactly what Postgres accepts, and there's nothing to compile on CI."
