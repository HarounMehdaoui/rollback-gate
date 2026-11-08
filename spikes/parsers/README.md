# Parser spike (T1.05b, throwaway)

Runs our own cases through each candidate. Node 26.13.0.

```bash
pnpm install --ignore-workspace
node prisma-trials.mjs get-dmmf     # also: ast, internals
node edge.mjs                       # empty, no-datasource and multi-file schemas
node sql-trials.mjs pg              # also: nsp (node-sql-parser)
node sql-perf.mjs                   # libpg-query init, speed
```

- `test.prisma`: every case the used set needs (`@map`, `@@map`, `@ignore`, `@@ignore`, relations,
  `@db.*`, defaults, enum `@@map` and value `@map`, unique indexes with and without `map:`).
- `ground-truth.sql`: Prisma 7.10.1's own DDL for it (`migrate diff --from-empty`).
- `sql/`: the T1.05a lab's real Prisma SQL plus a `DO` block, a typo and Postgres 17+ syntax.
- `evidence-*.txt`: the outputs the ADRs quote.
