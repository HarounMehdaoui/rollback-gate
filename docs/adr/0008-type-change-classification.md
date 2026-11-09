# ADR-0008: Compare column types in Postgres's spelling, against an explicit list of widenings

- **Status:** accepted
- **Date:** 2026-11-09

## Context
The type rules (RG-DB-006, 007, 008) compare base's column type, from the used set, with the type in
`ALTER COLUMN … TYPE`. The two come from different parsers (Prisma's engine and Postgres's), and
RULES.md gives the list of known widenings but not the spelling, the same-type case, or what each
Prisma scalar can hold.

## Options considered
1. **Spelling:** a. Postgres's internal names (`int4`, `varchar(255)`, `numeric(10,2)`, the enum's name),
   which libpg-query reports; b. SQL names (`integer`); c. Prisma's names (`VarChar(255)`).
2. **Compatibility:** a. a short explicit list, everything else unknown; b. Postgres's cast catalogue.
3. **`timestamp(3)` → `timestamp(6)`:** a. RG-DB-007, since a JavaScript `Date` keeps milliseconds only;
   b. no finding.

## Decision
1a, 2a, 3a. An unknown `@db.*` type is `null` in the used set and gives RG-DB-008 (UNSAFE). A change to
the same type gives no finding. A `USING` cast is always RG-DB-008. Each Prisma scalar covers:
`Int` → `int2`, `int4`; `BigInt` → up to `int8`; `Float` → `float4`, `float8`; `Decimal` → `numeric`;
`String` → `varchar`, `text`; `DateTime` → `timestamp(p ≤ 3)`.

## Consequences
- Base's and head's types compare directly, with no second translation table.
- "Postgres can cast it" doesn't mean "base still works" (`text` → `integer` casts some values), so
  only listed pairs are trusted. `timestamptz`, arrays and enum type changes are unknown (UNSAFE)
  until added with a test.
- RG-DB-007 also flags precision Prisma can't represent, following the rule's definition.

## How to defend it
"A short list I can defend line by line, and anything outside it fails closed. Both sides use the
spelling Postgres's own parser gives, so nothing is translated twice."
