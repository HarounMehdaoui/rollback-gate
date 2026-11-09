# Rules catalogue

This is the source of truth for every rule ID, severity, reason and fix. Code, scenarios and the README
must match it. Terms are defined in [GLOSSARY.md](GLOSSARY.md).

Statements about Prisma's behaviour were checked by experiment in the T1.05a lab (Prisma 7.10.1,
Postgres 18.6). The answers and evidence are in §6.

## 1. Key assumption

During a rollback, **code goes back exactly one release**. Schema, data and config **stay as the head
release left them**. So every release (head) must stay compatible with the previous release's code
(base).

Rollback Gate does **not** judge whether a migration is safe to *run* (locks, long rewrites, failing
on existing data). squawk covers that.

## 2. What "used by base" means

Everything a rule checks against comes from the **used set**, which is built from **base's**
`schema.prisma`. It never comes from head's schema.

- A **table** is used if a `model` maps to it and the model is not `@@ignore`.
- A **column** is used if a scalar field maps to it, the field is not `@ignore`, and its model is used.
  Relation fields have no column. Their foreign-key scalar fields do.
- An **enum** is used if at least one used column has that enum type.
- Names are resolved to real database names: `@@map` for tables, `@map` for columns, `@@map` on enums.
- Each used column records its Prisma scalar type, its native type (`@db.*`, or Prisma's default native
  type when there is none), whether it is optional (`?`), whether it is a list, its `@default`, and its
  enum name if it has one. Type rules need the base type because `ALTER COLUMN … TYPE` SQL contains
  only the *new* type.
- Phase 1 supports only the default `public` schema. Statements that target another schema normalize
  to `Unrecognized` (RG-DB-022), so the tool fails closed.

Consequence: anything not in the used set (new tables, columns added in this release, `@ignore`
fields) can change freely. That is why the backfill exception (RG-DB-018) works.

## 3. Severity policy

| Severity | Meaning | CI (`check`) | Deploy (Phase 5) |
|---|---|---|---|
| `SAFE` | No findings. Base works with what head leaves behind | pass, exit `0` | admitted |
| `RISKY` | Base *can* break, but only for some values or code paths | pass + warning, exit `0` | admitted |
| `UNSAFE` | Base *will* break during normal use after a rollback | **fail**, exit `1` | refused, unless overridden |

- **Rules emit only `RISKY` or `UNSAFE` findings.** A change that doesn't hurt base produces **no
  finding**. No findings means the verdict is `SAFE`.
- **Verdict = the worst finding.** Findings are sorted so the same findings always give the same
  report: UNSAFE first; then migrations in apply order (by name), with whole-migration findings
  before that migration's statements, statements by index, and release-wide findings last; then by
  rule ID and target. Duplicates are kept and counted.
- **Exit codes:** `0` = SAFE or RISKY, `1` = UNSAFE, `2` = tool error (crash, bad arguments, git
  failure). An unparsable migration is a *finding* (UNSAFE, exit `1`), not a tool error.
- **Fail-closed:** unparsable SQL → UNSAFE. An unknown type change → UNSAFE. SQL that parses but
  doesn't match any normalizer → RISKY.
- **Rehearsal (Phase 2)** can only *add* findings, so it can only raise the verdict
  ([ADR-0002](adr/0002-rehearsal-write-then-read-raise-only.md)).
- **Override:** an UNSAFE release is admitted at deploy time only if the PR has the label
  `rollback-unsafe-approved` **and** a non-empty "Rollback plan" section. The override is recorded in
  the attestation's `override` field (Phase 4). Open questions: who may approve, and how a PR's
  override carries into the release-mode verdict (see [ROADMAP](ROADMAP.md)).

### The principle: certain vs possible

- **UNSAFE = base *will* break during normal use.** The break doesn't depend on which values base
  writes or which code paths run. Examples: a table or column base queries is gone or renamed (Prisma
  selects every scalar column, so every query on the model fails); a required column base never sends;
  an enum type name base casts to no longer exists.
- **RISKY = base breaks only for some values.** It breaks if base writes a too-long string, a NULL, a
  duplicate, an orphan reference or a removed enum value, or if it reads a value head wrote that base
  doesn't understand. Whether that happens depends on data and code paths static analysis can't see.

**Why:** UNSAFE fails CI and blocks the deploy unless someone writes an override. If UNSAFE fires on
"might break" cases, overrides become routine, people stop reading them, and the one override that
matters gets approved without thought. UNSAFE has to stay rare to stay meaningful. RISKY findings
still show up in CI as warnings, and the Phase 2 rehearsal can raise them to UNSAFE when it actually
sees base fail.

**Fail-closed is the exception, on purpose.** When the tool *doesn't understand* a change, it can't
tell certain from possible, so it assumes the worst: unparsable SQL → UNSAFE (RG-DB-021), unknown type
change → UNSAFE (RG-DB-008), parsed but unrecognized → RISKY (RG-DB-022).

## 4. Rules

Every rule has an ID, the `Change` kind(s) it applies to, a condition, a severity, a reason (what
breaks in base) and a fix. "No finding" lists the cases where the rule stays silent on purpose.

### Tables and columns

#### RG-DB-001 · Drop table
- **Change:** `DropTable`
- **Condition:** the table is used by base. **No finding** if it isn't used (`@@ignore` model, or a
  table base doesn't know).
- **Severity:** UNSAFE
- **Reason:** every base query on this model fails with "relation does not exist".
- **Fix:** remove the model from the code (or `@@ignore` it) in one release, and drop the table in the
  next one.
- **Phase:** 1

#### RG-DB-002 · Drop column
- **Change:** `DropColumn`
- **Condition:** the column is used by base. **No finding** if it isn't (`@ignore`, or added in this
  release).
- **Severity:** UNSAFE
- **Reason:** by default base's Prisma client selects every scalar column of a model, so every query on
  the model fails, not only the ones that use this field.
- **Fix:** retire the field first (`@ignore`, stop writing it; make it nullable if it is required),
  then drop it one release later. See §5.
- **Phase:** 1

#### RG-DB-003 · Rename table
- **Change:** `RenameTable`
- **Condition:** the old name is used by base. **No finding** otherwise.
- **Severity:** UNSAFE
- **Reason:** base queries the old table name, which no longer exists.
- **Fix:** keep the database name and rename only the model (`@@map("OldName")`), or do an
  expand/contract migration over several releases.
- **Note:** Prisma turns a model rename into `DROP TABLE` + `CREATE TABLE` (§6 row 1), so Prisma
  renames show up as RG-DB-001. RG-DB-003 catches hand-written renames.
- **Phase:** 1

#### RG-DB-004 · Rename column
- **Change:** `RenameColumn`
- **Condition:** the old name is used by base. **No finding** otherwise.
- **Severity:** UNSAFE
- **Reason:** base selects the old column name, so every query on the model fails (same as RG-DB-002).
- **Fix:** keep the column name and rename only the field (`@map("old_name")`), or follow the
  4-release rename in §5.
- **Note:** Prisma turns a field rename into one statement, `ALTER TABLE … DROP COLUMN "old", ADD COLUMN
  "new" …` (§6 row 1), so Prisma renames show up as RG-DB-002 (and RG-DB-005 if the new column is
  required). RG-DB-004 catches hand-written renames.
- **Phase:** 1

#### RG-DB-005 · Required column added
- **Change:** `AddColumn` with `isNullable = false` and `hasDefault = false`
- **Condition:** the table is used by base. **No finding** for nullable columns, columns with a
  default, or tables base doesn't use (for example, tables created in this release).
- **Severity:** UNSAFE
- **Why (certain):** base doesn't know the column, so it never sends a value. *Every* base insert into
  the table violates NOT NULL.
- **Reason:** base inserts into this table fail with a NOT NULL violation.
- **Fix:** add the column as nullable or with a default. Tighten it in a later release.
- **Phase:** 1

### Types

Type rules compare the **base** type (from the used set) with the **head** type (from
`ALTER COLUMN … TYPE`). Both are normalized to Postgres types first. The known widenings are a short,
explicit list kept in code (`packages/db/src/rules/type-compat.ts`, T1.16). Anything not in the list
counts as unknown.

Proposed initial list. Each entry is a widening; the reverse direction is a narrowing:
- `varchar(n)` → `varchar(m)` with m > n; `varchar(n)` → `text`
- `smallint` → `integer` → `bigint`
- `real` → `double precision`
- `numeric(p,s)` → `numeric(p',s)` with p' > p
- `timestamp(p)` → `timestamp(p')` with p' > p

In code (T1.16), types use Postgres's internal spelling (`int2`, `int4`, `int8`, `float4`, `float8`,
`varchar(n)`, `numeric(p,s)`, `timestamp(p)`), the same as the used set. A change to the same type gives
no finding. For RG-DB-007, each Prisma scalar covers: `Int` → `int2`, `int4`; `BigInt` → up to `int8`;
`Float` → `float4`, `float8`; `Decimal` → `numeric`; `String` → `varchar`, `text`; `DateTime` →
`timestamp(p)` with p ≤ 3 (a JavaScript `Date` keeps milliseconds only).

Prisma's default native type for each scalar without `@db.*` (§6 row 2): `String` → `text`,
`Int` → `integer`, `BigInt` → `bigint`, `Float` → `double precision`, `Decimal` → `decimal(65,30)`,
`DateTime` → `timestamp(3)`, `Boolean` → `boolean`, `Json` → `jsonb`, `Bytes` → `bytea`.

#### RG-DB-006 · Type narrowing
- **Change:** `AlterColumnType`
- **Condition:** the column is used by base and the change is the reverse of a known widening.
- **Severity:** RISKY
- **Why (possible):** base breaks only when it writes a value that doesn't fit (a 200-character string
  into `varchar(50)`, a large number into `integer`). That depends on the data.
- **Reason:** base writes that don't fit the new type fail (value too long, out of range).
- **Fix:** keep the wider type, or first change base's schema (`@db.*`) so base never writes
  out-of-range values, then narrow one release later.
- **Phase:** 1

#### RG-DB-007 · Type widening that changes the Prisma scalar
- **Change:** `AlterColumnType`
- **Condition:** the column is used by base, the change is a known widening, and the base Prisma scalar
  can't represent all values of the new type (for example `Int` column → `bigint`). **No finding** when
  the base scalar still covers everything (`varchar(50)` → `varchar(255)` is still a `String`).
- **Severity:** RISKY
- **Why (possible):** base can still read and write. It goes wrong only for values head writes beyond
  what base's scalar handles.
- **Reason:** Prisma doesn't fail when it reads a `bigint` into an `Int` field: it returns a JavaScript
  number (§6 row 3). That number is exact only up to 2⁵³, so larger values come back silently wrong,
  and base code that assumes a 32-bit range may misbehave.
- **Fix:** widen base's schema type first (`BigInt`), then widen the column.
- **Phase:** 1

#### RG-DB-008 · Unknown type change
- **Change:** `AlterColumnType`
- **Condition:** the column is used by base and the change is neither a known widening nor a known
  narrowing. This includes changes between unrelated types (`text` → `integer`), a `USING` cast, and
  the case where the base type couldn't be resolved.
- **Severity:** UNSAFE (owner's decision, fail-closed)
- **Reason:** Rollback Gate can't prove that base can still read and write this column.
- **Fix:** add a new column with the new type and migrate with expand/contract. Or, if you know it is
  safe, document it and use an override.
- **Phase:** 1

### Nullability and defaults

#### RG-DB-009 · Set NOT NULL
- **Change:** `SetNotNull`
- **Condition:** the column is used by base and base's field is optional (`String?`). **No finding** if
  base's field is already required: base's client never sends NULL for it.
- **Severity:** RISKY
- **Why (possible):** base breaks only on the code paths that leave this optional field empty. A
  column that base always writes can be tightened with a warning, not an override. The Phase 2
  rehearsal raises it to UNSAFE if base's smoke test inserts NULL.
- **Reason:** base inserts or updates that leave this field empty fail with a NOT NULL violation.
- **Fix:** make sure base always writes the field before setting NOT NULL. Or keep the column nullable.
- **Phase:** 1

#### RG-DB-010 · Drop NOT NULL
- **Change:** `DropNotNull`
- **Condition:** the column is used by base and base's field is required. **No finding** if base's
  field is already optional.
- **Severity:** RISKY (owner's decision)
- **Reason:** if head writes NULL here, base reads it without any error: Prisma returns `null` for a
  field its TypeScript type says is never null (§6 row 4). Base breaks later, wherever its code uses
  the value (a crash on `.length`, a wrong comparison).
- **Fix:** keep writing the column in this release, and stop writing it one release later. See §5.
- **Phase:** 1

#### RG-DB-011 · Drop default
- **Change:** `DropDefault`
- **Condition:** the column is used by base, and base's field has a `@default` that the **database**
  applies. With Prisma 7 that's only `autoincrement()` and `dbgenerated(...)`: for every other default
  (`now()`, literals, enum values, `uuid()`, `cuid()`, `@updatedAt`) Prisma sends the value itself, so
  dropping the database default doesn't affect base (§6 row 5). **No finding** for those.
- **Severity:** UNSAFE if the column is NOT NULL. RISKY if it is nullable.
- **Why:** a default exists because code omits the field. If NOT NULL, base's inserts that rely on the
  default now fail during normal use (certain → UNSAFE). If nullable, the inserts still succeed but
  store NULL instead of the default, so base breaks only where it later depends on that value
  (possible → RISKY).
- **Reason:** base inserts that relied on the default now fail (NOT NULL) or store NULL.
- **Fix:** keep the default until base no longer relies on it (base sets the value explicitly), then
  drop it one release later.
- **Phase:** 1

### Constraints and indexes

New constraints are **RISKY**, not UNSAFE: base breaks only if it writes data that violates them.
Dropping a constraint or an index can't make base's writes violate anything, so it produces no
finding, except a unique index base's `upsert` relies on (RG-DB-023).

#### RG-DB-012 · New unique constraint or primary key
- **Change:** `CreateUniqueIndex`, or `AddConstraint` with `constraint = 'unique' | 'primaryKey'`
- **Condition:** at least one of the constrained columns is used by base.
- **Severity:** RISKY
- **Why (possible):** base fails only if it inserts a duplicate.
- **Reason:** base writes that create a duplicate value now fail with a unique violation.
- **Fix:** add `@unique` to the code (and handle the conflict) one release before adding the index.
- **Phase:** 1

#### RG-DB-013 · New CHECK constraint
- **Change:** `AddConstraint` with `constraint = 'check'`
- **Condition:** the table is used by base. Column-level analysis of the CHECK expression is out of
  scope, so any CHECK on a used table counts.
- **Severity:** RISKY
- **Why (possible):** base fails only for values that violate the CHECK.
- **Reason:** base writes that violate the CHECK fail.
- **Fix:** enforce the same condition in code one release before adding the constraint. Or add it
  `NOT VALID` and validate it later, which protects existing rows only.
- **Phase:** 1

#### RG-DB-014 · New foreign key
- **Change:** `AddConstraint` with `constraint = 'foreignKey'`
- **Condition:** the constrained table is used by base.
- **Severity:** RISKY
- **Why (possible):** base fails only if it writes an orphan reference or deletes a parent row that
  still has children.
- **Reason:** base inserts with a missing parent, or deletes of a referenced parent, now fail.
- **Fix:** add the relation to the schema and make the code respect it one release before adding the FK.
- **Phase:** 1

#### RG-DB-023 · Unique index dropped that base relies on
- **Change:** `DropIndex`, or `DropConstraint` of a unique constraint
- **Condition:** the dropped name is one of base's unique indexes (from `@unique`, `@@unique` or `@id`
  on a used table). `DROP INDEX` carries only the name, so this needs the used set to record base's
  unique indexes by name: the `map:` value, or Prisma's default `<table>_<columns>_key` built from
  database names and cut to fit Postgres's 63-character limit (ADR-0004, T1.06).
- **Severity:** RISKY (owner's decision)
- **Why (possible):** Prisma's `upsert` is a native `INSERT … ON CONFLICT (<columns>)`, which needs that
  unique index (§6 row 6). Base breaks only on the code paths that `upsert` on those columns; reads and
  plain writes keep working.
- **Reason:** base's `upsert` on these columns fails with `P2039` (Postgres `42P10`: "there is no
  unique or exclusion constraint matching the ON CONFLICT specification").
- **Fix:** remove `@unique` from the schema and stop using `upsert` on that field in one release, and
  drop the index one release later.
- **Phase:** 1

### Enums

#### RG-DB-015 · Enum value added
- **Change:** `AddEnumValue`
- **Condition:** the enum is used by base.
- **Severity:** RISKY (owner's decision)
- **Reason:** base reads of rows that hold the new value fail: Prisma raises
  `P2023 Value '<value>' not found in enum '<Enum>'` (§6 row 7).
- **Fix:** add the value in one release without writing it, and start writing it one release later.
- **Phase:** 1

#### RG-DB-016 · Enum value removed
- **Change:** `RemoveEnumValue`. Produced only by the multi-statement recognizer
  (ADR-0006, written in T1.20), because Postgres has no `DROP VALUE` and Prisma recreates the
  type instead.
- **Condition:** the enum is used by base.
- **Severity:** RISKY
- **Why (possible):** base breaks only on the code paths that write the removed value.
- **Reason:** base writes that use the removed value fail with "invalid input value for enum".
- **Fix:** stop writing the value in one release, and remove it one release later.
- **Before T1.20:** the recreate statements fall through to RG-DB-008 (`ALTER COLUMN … TYPE "Role_new"`
  is an unknown type change) and RG-DB-017, so the tool fails closed (UNSAFE, stricter than the final
  RISKY) until the recognizer exists. Prisma's exact SQL (§6 row 8), inside `BEGIN; … COMMIT;`:
  `CREATE TYPE "X_new"` → `ALTER COLUMN … DROP DEFAULT` → `ALTER COLUMN … TYPE "X_new" USING …` →
  `ALTER TYPE "X" RENAME TO "X_old"` → `ALTER TYPE "X_new" RENAME TO "X"` → `DROP TYPE "X_old"` →
  `ALTER COLUMN … SET DEFAULT …` (the default lines appear only when the column has a default).
- **Phase:** 1

#### RG-DB-017 · Enum type renamed
- **Change:** `RenameEnum`
- **Condition:** the old name is an enum used by base.
- **Severity:** UNSAFE
- **Why (certain):** if base's queries name the type, every base write to columns of that enum fails.
  This is the same class as RG-DB-003.
- **Reason:** base's queries cast to the old enum type name, which no longer exists. Prisma sends
  `CAST($1::text AS "public"."Role")` for every enum parameter (§6 row 9).
- **Fix:** keep the database name and rename in Prisma only (`@@map` on the enum).
- **Phase:** 1

### Data changes

#### RG-DB-018 · Rows updated
- **Change:** `UpdateRows`
- **Condition:** the UPDATE sets at least one column used by base.
- **Backfill exception (owner's rule):** an UPDATE that sets only columns added in the same release is
  SAFE (no finding). It falls out of the condition: columns added in this release are never in base's
  used set. The condition also stays silent for UPDATEs that set only `@ignore` columns, which base
  never reads either.
- **Severity:** RISKY
- **Why (possible):** the rewritten values may or may not be ones base understands (format change,
  units, meaning).
- **Reason:** base reads values that head rewrote and may interpret them wrongly.
- **Fix:** write transformed data to a new column (expand/contract) instead of rewriting a column base
  reads.
- **Phase:** 1

#### RG-DB-019 · Rows deleted
- **Change:** `DeleteRows` (`DELETE` and `TRUNCATE`)
- **Condition:** the table is used by base.
- **Severity:** RISKY
- **Why (possible):** base code usually copes with fewer rows. It breaks only when it expects specific
  rows to exist (lookup tables, seed data). Rollback Gate asks "does base's code still work", not "can
  data be recovered".
- **Reason:** base code that expects the deleted rows (lookups, seeds, references) fails or misbehaves.
- **Fix:** soft-delete, or delete in a later release once base no longer reads those rows.
- **Phase:** 1

### Migration history and fail-closed

#### RG-DB-020 · Edited or removed migration
- **Change:** `EditedMigration` (`edit = 'modified' | 'removed'`), produced by the migration history
  diff. Its source is the migration (`{ kind: 'migration' }`), not a statement.
- **Condition:** a migration present in base has a different sha256 in head (`modified`), or is missing
  from head (`removed`).
- **Severity:** UNSAFE (both `modified` and `removed`)
- **Reason:** environments that already applied the old version now differ from what head's history
  says, so neither base's nor head's schema can be trusted to match the database.
- **Fix:** never edit an applied migration. Revert the edit and add a new migration instead.
- **Note:** the hash is taken after CRLF → LF, so a change of line endings alone isn't an edit. Prisma
  agrees: its stored checksum is the sha256 of the LF content, and a CRLF-only change isn't reported
  as modified (§6 row 12).
- **Phase:** 1

#### RG-DB-021 · Unparsable SQL
- **Change:** `Unparsable`. libpg-query rejects the whole file, so the source is the migration.
- **Condition:** always.
- **Severity:** UNSAFE (owner's decision, fail-closed)
- **Reason:** Rollback Gate can't tell what this migration does to base.
- **Fix:** fix the SQL so Postgres's own parser accepts it.
- **Phase:** 1

#### RG-DB-022 · Unrecognized statement
- **Change:** `Unrecognized`
- **Condition:** always (the statement parsed, but no normalizer maps it).
- **Severity:** RISKY (owner's decision, fail-closed)
- **Reason:** Rollback Gate understands the syntax but doesn't model this statement's effect on base.
- **Fix:** check the statement by hand. If it is common, open an issue to add a normalizer.
- **Phase:** 1

### Recognized statements with no rule

These normalize to a `Change` but never produce a finding, because they can't break base. Recognizing
them keeps them from becoming `Unrecognized` (RG-DB-022) noise.

| Change | SQL | Why it is harmless to base |
|---|---|---|
| `CreateTable` | `CREATE TABLE` | base doesn't know the table |
| `CreateIndex` | `CREATE INDEX` (non-unique) | doesn't change what base can read or write |
| `DropIndex`, `DropConstraint` | `DROP INDEX`, `ALTER TABLE … DROP CONSTRAINT` | relaxes rules; exception: a unique index base relies on (RG-DB-023) |
| `RenameIndex` | `ALTER INDEX … RENAME`, `ALTER TABLE … RENAME CONSTRAINT` (index, primary-key and foreign-key renames, §6 row 10) | base never names indexes |
| `SetDefault` | `ALTER COLUMN … SET DEFAULT` | base inserts still succeed |
| `CreateEnum`, `DropEnum` | `CREATE TYPE … AS ENUM`, `DROP TYPE` | base can't use a new type. A used enum can't be dropped while a used column still has that type, so that case is already caught by the column rules |
| — | `CREATE SCHEMA IF NOT EXISTS "public"` | Prisma 7 emits it at the top of a diff from an empty database (§6, other findings) |
| — | `BEGIN`, `COMMIT`, comments | the normalizer skips them and produces no `Change` |

Prisma drops an index by name only: `DROP INDEX "User_email_key"`, with no table (§6 row 10).

### Reserved for later phases

#### RG-CFG-001 · Required env var removed
- **Change:** config contract diff (Phase 2, `packages/config`)
- **Condition:** an env var that base requires is missing from head's deployment config.
- **Severity:** UNSAFE (owner's decision)
- **Reason:** base fails at startup, or on first use, with the head config.
- **Fix:** keep the variable in the config until base no longer requires it.
- **Source:** `{ kind: 'release' }`
- **Phase:** 2

#### RG-RH-001 · Rehearsal failure
- **Change:** none (produced by the rehearsal, `packages/rehearsal`)
- **Condition:** base's healthcheck or smoke test fails after head wrote data
  ([ADR-0002](adr/0002-rehearsal-write-then-read-raise-only.md)).
- **Severity:** UNSAFE (owner's decision)
- **Reason:** base was run against head's schema, data and config and failed.
- **Fix:** read the rehearsal logs, then find the static rule that should have caught it (and open an
  issue if none exists).
- **Source:** `{ kind: 'release' }`
- **Phase:** 2

## 5. Worked example: renaming `User.name` to `User.fullName` in four releases

A direct rename is UNSAFE (RG-DB-002 or RG-DB-004). The safe path takes four releases, and each one is
checked against the one before it.

| Release | Schema and migration | Code | Findings vs previous release | Verdict |
|---|---|---|---|---|
| **R1 expand** | `ADD COLUMN "fullName" TEXT` (nullable); `UPDATE "User" SET "fullName" = "name"` | writes both, reads `name` | none: the column is nullable (so not RG-DB-005), and the UPDATE sets only a column added in this release (backfill exception) | `SAFE` |
| **R2 switch** | `ALTER COLUMN "name" DROP NOT NULL`; `UPDATE "User" SET "fullName" = "name" WHERE "fullName" IS NULL` (rows base wrote during the rollout) | writes both, reads `fullName` | RG-DB-010 (base R1 has `name` required); RG-DB-018 (`fullName` is used by R1) | `RISKY` |
| **R3 retire** | `name String? @ignore`, no migration | stops writing `name` | none | `SAFE` |
| **R4 contract** | `DROP COLUMN "name"` | — | none: `name` is `@ignore` in base R3, so it isn't used | `SAFE` |

**Why R2 and R3 can't be merged.** Suppose one release drops NOT NULL *and* stops writing `name`, and
you roll back from it to R1. R1's schema says `name` is required and R1 reads it, so every row the
merged release wrote (with `name` = NULL) breaks R1's reads. Split in two, each rollback is fine:
R2 → R1 works because R2 still writes `name`, and R3 → R2 works because R2 already treats `name` as
optional and reads `fullName`.

**An honest limit worth knowing.** Statically, R2 and a merged R2+R3 look the same: both only show
RG-DB-010 (RISKY). The difference ("stops writing `name`") is in application code, which Phase 1
doesn't read. That is exactly why DropNotNull is RISKY and not SAFE, and why the Phase 2 rehearsal
exists: head writes rows, then base reads them, so the merged version would fail with RG-RH-001.

**Why R3 and R4 can't be merged** (retire and drop in one release): base R2 still uses `name`, so the
DROP COLUMN is RG-DB-002, UNSAFE. The tool catches this one statically.

Checked (§6 row 11): adding `@ignore` generates an empty migration, so the column stays, and Prisma
accepts `@ignore` on a nullable field without a default (and even on a required one).

## 6. Prisma behaviour lab results

Every statement this catalogue makes about Prisma was checked **by experiment, not by reading docs**,
in the T1.05a lab: a throwaway Prisma project against Postgres in Docker, with statement logging on so
the SQL Postgres actually received is visible. The lab (schemas, script, raw evidence) is in the T1.05a
PR's history under `spikes/prisma-lab/`.

Lab versions: Prisma `7.10.1` (with `@prisma/adapter-pg` 7.10.1) · Postgres `18.6` · Node `26.13.0`.
Rerun the lab when the supported Prisma version changes.

| # | Question | Affects | Answer | Evidence |
|---|---|---|---|---|
| 1 | Does a field rename become `DROP` + `ADD` rather than `RENAME COLUMN`? | RG-DB-002/003/004/005 | **Yes**, in one statement. A model rename becomes `DROP TABLE` + `CREATE TABLE`. | `ALTER TABLE "User" DROP COLUMN "name", ADD COLUMN "fullName" TEXT NOT NULL;` |
| 2 | What native type does Prisma use for each scalar without `@db.*`? | Types (§4) | As assumed: `TEXT`, `INTEGER`, `BIGINT`, `DOUBLE PRECISION`, `DECIMAL(65,30)`, `BOOLEAN`, `TIMESTAMP(3)`, `JSONB`, `BYTEA` | `CREATE TABLE` from `migrate diff --from-empty` |
| 3 | Reading a `bigint` above 2³¹ into an `Int` field: error or overflow? | RG-DB-007 | **Neither**: it returns a JS number (5000000000 came back exact). Exact only up to 2⁵³. | `findUnique` → `{"small":5000000000}` |
| 4 | Reading NULL into a required field: error or `null`? | RG-DB-010 | **`null`, no error** | `findUnique` → `{"label":null}` |
| 5 | Which `@default`s does the database apply, and which does Prisma send? | RG-DB-011 | Database: only `autoincrement()` and `dbgenerated()`. Prisma sends `now()`, literals, enum values, `uuid()`, `cuid()`, `@updatedAt` itself (the DDL still has `DEFAULT` clauses for `now()`, literals and enums). | `INSERT INTO "public"."Item" ("small","label","email","role","createdAt","status","uuid","cuid","updatedAt") VALUES (…)`: no `id`, no `dbgen` |
| 6 | Does `upsert` rely on a database unique constraint? | RG-DB-023 | **Yes**: native `INSERT … ON CONFLICT ("email") DO UPDATE`. With the unique index dropped, base's `upsert` fails. | `P2039 … Code: 42P10. there is no unique or exclusion constraint matching the ON CONFLICT specification` |
| 7 | Does reading an unknown enum value raise an error? | RG-DB-015 | **Yes** | `P2023 Value 'OWNER' not found in enum 'Role'` |
| 8 | Exact SQL to remove an enum value? | RG-DB-016, ADR-0006 | `BEGIN; CREATE TYPE "Role_new" …; ALTER COLUMN "role" DROP DEFAULT; ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new"); ALTER TYPE "Role" RENAME TO "Role_old"; ALTER TYPE "Role_new" RENAME TO "Role"; DROP TYPE "Role_old"; ALTER COLUMN "role" SET DEFAULT 'USER'; COMMIT;` | `migrate diff` output |
| 9 | Are enum parameters cast by type name? | RG-DB-017 | **Yes**, schema-qualified | `WHERE "public"."Item"."role" = CAST($1::text AS "public"."Role")` |
| 10 | SQL for dropping a unique index; for renames of indexes and constraints? | no-rule table | `DROP INDEX "User_email_key"` (name only). Index rename: `ALTER INDEX … RENAME TO`. Primary-key and foreign-key renames: `ALTER TABLE … RENAME CONSTRAINT`. | `migrate diff` output |
| 11 | Does `@ignore` keep the column? Allowed on a nullable field without a default? | §5 | **Yes** and **yes** (also on a required one) | `-- This is an empty migration.`; `prisma validate` passes |
| 12 | Does Prisma's own checksum ignore CRLF vs LF? | RG-DB-020 | **Yes**: the stored checksum is the sha256 of the LF content (same as ours), and a CRLF-only change isn't reported | stored `89c943…` = sha256 of the LF file; `migrate status`: "Database schema is up to date!" |

**Other findings** (for later tasks):
- Prisma 7 rejects `url` in the `datasource` block (`P1012`): the connection moved to `prisma.config.ts`.
  That config can also move the schema and migrations folders, which the loader doesn't follow yet
  (it reads `prisma/schema.prisma`, T1.04).
- A diff from an empty database starts with `CREATE SCHEMA IF NOT EXISTS "public";`, now in the no-rule
  table. A normal first `migrate dev` migration didn't include it.
- One `ALTER TABLE` can carry several actions (the rename in row 1): the normalizer (T1.09) must split
  it into one change per action.
- After a column with `dbgenerated()`, a later `migrate dev` can emit a redundant
  `ALTER COLUMN … SET DEFAULT` for it. Harmless: `SetDefault` has no rule.
- The Prisma 7 client queries with schema-qualified names (`"public"."Item"`).
- Column alterations (T1.14, `migrate diff --from-schema --to-schema`): a type change is
  `ALTER COLUMN … SET DATA TYPE …` without `USING`; a change Postgres can't cast implicitly
  (`String` → `Int`) becomes `DROP COLUMN` + `ADD COLUMN` instead (RG-DB-002 / RG-DB-005). Several
  alterations on one table come as one multi-action `ALTER TABLE`.
- Removing `@default(autoincrement())` emits `DROP SEQUENCE "";`, an empty name that Postgres's parser
  rejects (`zero-length delimited identifier`). Such a migration is RG-DB-021 (UNSAFE), and it would
  fail to deploy too.
- Constraints, indexes and enums (T1.17): `@unique` / `@@unique` become `CREATE UNIQUE INDEX`, `@@index`
  `CREATE INDEX`, a primary key change `DROP CONSTRAINT …, ADD CONSTRAINT … PRIMARY KEY`, and a foreign
  key `ADD CONSTRAINT … FOREIGN KEY`. An enum rename (`@@map`) is never `ALTER TYPE … RENAME`: Prisma
  creates the new type, drops and re-adds the column, and drops the old type (RG-DB-002 / RG-DB-005);
  RG-DB-017 catches hand-written renames.
