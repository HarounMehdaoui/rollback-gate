import type { Change } from '@rollbackgate/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { normalizeMigration } from './normalize.js';
import { postgresTypeName } from './normalizers/type-name.js';
import { initSqlParser, parseSql } from './parse-sql.js';

beforeAll(async () => {
  await initSqlParser();
});

function changesOf(sql: string): Change[] {
  const parsed = parseSql(sql);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return normalizeMigration('2_alter', parsed.statements).map((c) => c.change);
}

// Verbatim output of `prisma migrate diff --from-schema --to-schema --script`, Prisma 7.10.1,
// for a model `T` whose field `a` (and `b`) changed as named.
const prisma = {
  narrowVarchar: '-- AlterTable\nALTER TABLE "T" ALTER COLUMN "a" SET DATA TYPE VARCHAR(50);',
  intToBigInt: '-- AlterTable\nALTER TABLE "T" ALTER COLUMN "a" SET DATA TYPE BIGINT;',
  intToString: '-- AlterTable\nALTER TABLE "T" ALTER COLUMN "a" SET DATA TYPE TEXT;',
  setNotNull: '-- AlterTable\nALTER TABLE "T" ALTER COLUMN "a" SET NOT NULL;',
  dropNotNull: '-- AlterTable\nALTER TABLE "T" ALTER COLUMN "a" DROP NOT NULL;',
  setDefault: '-- AlterTable\nALTER TABLE "T" ALTER COLUMN "a" SET DEFAULT \'x\';',
  dropDbgenerated: '-- AlterTable\nALTER TABLE "T" ALTER COLUMN "a" DROP DEFAULT;',
  dropAutoincrement:
    '-- AlterTable\nALTER TABLE "T" ALTER COLUMN "a" DROP DEFAULT;\nDROP SEQUENCE "";',
  combined:
    '-- AlterTable\nALTER TABLE "T" ALTER COLUMN "a" SET NOT NULL,\nALTER COLUMN "a" SET DEFAULT \'x\',\nALTER COLUMN "b" SET DEFAULT 1,\nALTER COLUMN "b" SET DATA TYPE BIGINT;',
};

describe('normalizing Prisma’s column alterations', () => {
  it.each([
    ['narrowVarchar', 'varchar(50)'],
    ['intToBigInt', 'int8'],
    ['intToString', 'text'],
  ] as const)('turns %s into AlterColumnType to %s', (key, toType) => {
    expect(changesOf(prisma[key])).toEqual([
      { kind: 'AlterColumnType', table: 'T', column: 'a', toType, hasUsing: false },
    ]);
  });

  it.each([
    ['setNotNull', 'SetNotNull'],
    ['dropNotNull', 'DropNotNull'],
    ['setDefault', 'SetDefault'],
    ['dropDbgenerated', 'DropDefault'],
  ] as const)('turns %s into %s', (key, kind) => {
    expect(changesOf(prisma[key])).toEqual([{ kind, table: 'T', column: 'a' }]);
  });

  it('splits Prisma’s combined ALTER TABLE into one change per action, in order', () => {
    expect(changesOf(prisma.combined)).toEqual([
      { kind: 'SetNotNull', table: 'T', column: 'a' },
      { kind: 'SetDefault', table: 'T', column: 'a' },
      { kind: 'SetDefault', table: 'T', column: 'b' },
      { kind: 'AlterColumnType', table: 'T', column: 'b', toType: 'int8', hasUsing: false },
    ]);
  });

  // Prisma 7.10.1 emits an empty sequence name when autoincrement() is removed; Postgres's own
  // parser rejects it, so the migration is Unparsable (RG-DB-021), as it would fail to deploy.
  it('finds Prisma’s SQL for removing autoincrement() unparsable', () => {
    const result = parseSql(prisma.dropAutoincrement);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.message).toContain('zero-length delimited identifier');
  });
});

describe('AlterColumnType target types', () => {
  it.each([
    ['INTEGER', 'int4'],
    ['DOUBLE PRECISION', 'float8'],
    ['DECIMAL(10,2)', 'numeric(10,2)'],
    ['TIMESTAMPTZ(6)', 'timestamptz(6)'],
    ['TIMESTAMP(3)', 'timestamp(3)'],
    ['"Role_new"', 'Role_new'],
    ['"public"."Role"', 'Role'],
    ['TEXT[]', 'text[]'],
    ['"auth"."level"', 'auth.level'],
  ])('spells %s as %s, like the used set', (sql, toType) => {
    expect(changesOf(`ALTER TABLE "T" ALTER COLUMN "a" TYPE ${sql};`)).toEqual([
      { kind: 'AlterColumnType', table: 'T', column: 'a', toType, hasUsing: false },
    ]);
  });

  it('records a USING clause (Prisma’s enum recreate uses one)', () => {
    expect(
      changesOf(
        'ALTER TABLE "T" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");',
      ),
    ).toEqual([
      { kind: 'AlterColumnType', table: 'T', column: 'role', toType: 'Role_new', hasUsing: true },
    ]);
  });

  it('keeps a zero modifier, which the parser stores as an empty value', () => {
    expect(changesOf('ALTER TABLE "T" ALTER COLUMN "a" TYPE TIMESTAMP(0);')).toEqual([
      { kind: 'AlterColumnType', table: 'T', column: 'a', toType: 'timestamp(0)', hasUsing: false },
    ]);
  });
});

describe('postgresTypeName', () => {
  it('gives up on a modifier that isn’t a number, so the statement becomes Unrecognized', () => {
    expect(
      postgresTypeName({
        names: [{ String: { sval: 'varchar' } }],
        typmods: [{ ColumnRef: { fields: [{ String: { sval: 'n' } }] } }],
      }),
    ).toBeNull();
  });

  it('gives up on a type without a name', () => {
    expect(postgresTypeName(undefined)).toBeNull();
  });
});
