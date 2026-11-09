# ADR-0006: Recognize multi-statement patterns after normalization, exactly or not at all

- **Status:** accepted
- **Date:** 2026-11-09

## Context
The pipeline maps one statement to zero or more changes. Postgres has no `DROP VALUE` for enums, so
Prisma removes an enum value with a sequence of statements (RULES.md §6 row 8, checked again with
Prisma 7.10.1 in T1.20):

```sql
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "U" ALTER COLUMN "role" DROP DEFAULT;                 -- only if the column has a default
ALTER TABLE "U" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "U" ALTER COLUMN "roles" TYPE "Role_new"[] USING ("roles"::text::"Role_new"[]);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "U" ALTER COLUMN "role" SET DEFAULT 'USER';           -- only if it had one
COMMIT;
```

Statement by statement this reads as an unknown type change (RG-DB-008) and an enum rename (RG-DB-017),
both UNSAFE, while the real effect is "values removed" (RG-DB-016, RISKY). Which values were removed
isn't in the SQL at all: only the new list is.

## Options considered
1. **Match on the SQL syntax tree, before normalization.** Sees everything, but couples the matcher to
   Postgres's AST and breaks "rules and patterns read only changes" (ARCHITECTURE §10, rule 3).
2. **Match on normalized changes, per migration, before the rules.** The sequence is already plain data
   (`CreateEnum`, `DropDefault`, `AlterColumnType`, `RenameEnum`, `DropEnum`, `SetDefault`), so the
   matcher is small and testable. Needs base's used set to know the old values.
3. **Teach the rules about each other** (RG-DB-008 ignores types ending in `_new`, …). Spreads one
   pattern over several rules and fails open if a name merely looks like Prisma's.

## Decision
Option 2. `recognizeEnumRecreate(changes, usedSet)` runs on each migration's normalized changes, after
normalization and before the rules, and only on consecutive changes of one migration. It matches the
exact sequence: `CreateEnum "X_new"`, then for each converted column an optional `DropDefault` and an
`AlterColumnType` to `X_new` or `X_new[]` with `USING`, then `RenameEnum X → X_old`,
`RenameEnum X_new → X`, `DropEnum X_old`, then one `SetDefault` for each dropped default. The match is
replaced by one `RemoveEnumValue` per value base's enum `X` has and the new list doesn't, sourced at the
`CreateEnum` statement. If base doesn't use `X`, the match is replaced by nothing: no used column has
that type.

**Partial or modified match → no match.** The changes stay as they are, so the migration still gets
RG-DB-008 and RG-DB-017 (UNSAFE). The recognizer can only make a finding milder when the whole sequence
is exactly Prisma's.

## Consequences
- Real Prisma output for an enum value removal gives exactly RG-DB-016 (RISKY).
- A hand-edited sequence (an extra statement in the middle, a default not restored, a different
  column type) stays UNSAFE. That's noisy for unusual hand-written SQL, and deliberate.
- Adding another pattern means another recognizer of the same shape, in the same place, with the same
  rule: exact match or nothing.
- The removed values come from base's schema, not the database. Values added earlier in the same
  release aren't in it, which is right: base never writes them.

## How to defend it
"One statement doesn't always mean one change: Prisma removes an enum value with seven. The recognizer
replaces that sequence only when it matches exactly; anything else keeps the stricter statement-by-
statement verdict, so the pattern can never hide something it doesn't fully understand."
