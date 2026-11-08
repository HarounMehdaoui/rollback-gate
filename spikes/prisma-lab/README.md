# Prisma behaviour lab (T1.05a, throwaway)

Answers RULES.md §6 by experiment. Prisma 7.10.1, Postgres 18.6, Node 26.13.0.

```bash
docker run -d --rm --name rg-lab-pg -e POSTGRES_PASSWORD=lab -p 127.0.0.1:55432:5432 \
  postgres:18.6 -c log_statement=all
docker exec rg-lab-pg psql -U postgres -c 'create database lab'
pnpm install --ignore-workspace
pnpm exec prisma migrate deploy && pnpm exec prisma generate
pnpm exec prisma migrate diff --from-schema schemas/e1-before.prisma --to-schema schemas/e1-after.prisma --script
node lab.ts e5   # then read `docker logs rg-lab-pg` for the SQL Postgres received
```

`schemas/` holds the before/after pairs for the SQL experiments (1, 2, 8, 10, 11). `lab.ts` runs the
client experiments (3, 4, 5, 6, 7, 9); the odd data for 3, 4 and 7 is written with psql first.
`evidence/` has the generated SQL, the Postgres log extracts and the client errors.
