import type { Change } from '@rollbackgate/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { normalizeMigration } from './normalize.js';
import { initSqlParser, parseSql } from './parse-sql.js';

beforeAll(async () => {
  await initSqlParser();
});

function changesOf(sql: string): Change[] {
  const parsed = parseSql(sql);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return normalizeMigration('2_change', parsed.statements).map((c) => c.change);
}

// Verbatim output of `prisma migrate diff --from-schema --to-schema --script`, Prisma 7.10.1.
const prisma = {
  addUnique: '-- CreateIndex\nCREATE UNIQUE INDEX "U_email_key" ON "U"("email");',
  addCompoundUnique: '-- CreateIndex\nCREATE UNIQUE INDEX "u_a_b" ON "U"("a", "b");',
  addIndex: '-- CreateIndex\nCREATE INDEX "U_a_idx" ON "U"("a");',
  dropUnique: '-- DropIndex\nDROP INDEX "U_email_key";',
  renameIndex: '-- RenameIndex\nALTER INDEX "U_email_key" RENAME TO "u_email";',
  renamePrimaryKey: '-- AlterTable\nALTER TABLE "U" RENAME CONSTRAINT "U_pkey" TO "u_pk";',
  addForeignKey:
    '-- AddForeignKey\nALTER TABLE "P" ADD CONSTRAINT "P_uid_fkey" FOREIGN KEY ("uid") REFERENCES "U"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
  changePrimaryKey:
    '-- AlterTable\nALTER TABLE "U" DROP CONSTRAINT "U_pkey",\nADD CONSTRAINT "U_pkey" PRIMARY KEY ("id", "a");',
  addEnumValue: '-- AlterEnum\nALTER TYPE "Role" ADD VALUE \'C\';',
  // Prisma "renames" an enum (@@map) by creating a new type and replacing the column.
  renameEnum:
    '-- CreateEnum\nCREATE TYPE "user_role" AS ENUM (\'A\', \'B\');\n\n-- AlterTable\nALTER TABLE "U" DROP COLUMN "role",\nADD COLUMN     "role" "user_role" NOT NULL;\n\n-- DropEnum\nDROP TYPE "Role";',
};

describe('normalizing Prisma’s constraint, index and enum SQL', () => {
  it.each([
    [
      'addUnique',
      { kind: 'CreateUniqueIndex', table: 'U', columns: ['email'], name: 'U_email_key' },
    ],
    [
      'addCompoundUnique',
      { kind: 'CreateUniqueIndex', table: 'U', columns: ['a', 'b'], name: 'u_a_b' },
    ],
    ['addIndex', { kind: 'CreateIndex', table: 'U', columns: ['a'], name: 'U_a_idx' }],
    ['dropUnique', { kind: 'DropIndex', name: 'U_email_key' }],
    ['renameIndex', { kind: 'RenameIndex', from: 'U_email_key', to: 'u_email' }],
    ['renamePrimaryKey', { kind: 'RenameIndex', from: 'U_pkey', to: 'u_pk' }],
    [
      'addForeignKey',
      {
        kind: 'AddConstraint',
        table: 'P',
        constraint: 'foreignKey',
        columns: ['uid'],
        name: 'P_uid_fkey',
      },
    ],
    ['addEnumValue', { kind: 'AddEnumValue', enumName: 'Role', value: 'C' }],
  ] as const)('turns %s into one change', (key, change) => {
    expect(changesOf(prisma[key])).toEqual([change]);
  });

  it('splits a primary key change into DropConstraint and AddConstraint', () => {
    expect(changesOf(prisma.changePrimaryKey)).toEqual([
      { kind: 'DropConstraint', table: 'U', name: 'U_pkey' },
      {
        kind: 'AddConstraint',
        table: 'U',
        constraint: 'primaryKey',
        columns: ['id', 'a'],
        name: 'U_pkey',
      },
    ]);
  });

  it('turns Prisma’s enum rename into create, column replace and drop', () => {
    expect(changesOf(prisma.renameEnum)).toEqual([
      { kind: 'CreateEnum', enumName: 'user_role', values: ['A', 'B'] },
      { kind: 'DropColumn', table: 'U', column: 'role' },
      { kind: 'AddColumn', table: 'U', column: 'role', isNullable: false, hasDefault: false },
      { kind: 'DropEnum', enumName: 'Role' },
    ]);
  });
});

describe('normalizing hand-written statements', () => {
  it.each([
    [
      'ALTER TABLE "U" ADD CONSTRAINT "u_pos" CHECK ("a" > 0);',
      { kind: 'AddConstraint', table: 'U', constraint: 'check', columns: [], name: 'u_pos' },
    ],
    [
      'ALTER TABLE "U" ADD UNIQUE ("b");',
      { kind: 'AddConstraint', table: 'U', constraint: 'unique', columns: ['b'] },
    ],
    [
      'ALTER TABLE "U" DROP CONSTRAINT "u_pos";',
      { kind: 'DropConstraint', table: 'U', name: 'u_pos' },
    ],
    [
      'ALTER TYPE "Role" RENAME TO "user_role";',
      { kind: 'RenameEnum', from: 'Role', to: 'user_role' },
    ],
    [
      'UPDATE "U" SET "a" = \'x\', "b" = "a" WHERE "id" = 1;',
      { kind: 'UpdateRows', table: 'U', columns: ['a', 'b'] },
    ],
    ['DELETE FROM "U" WHERE "id" = 1;', { kind: 'DeleteRows', table: 'U' }],
    ['DROP INDEX "public"."U_a_idx";', { kind: 'DropIndex', name: 'U_a_idx' }],
  ] as const)('normalizes %s', (sql, change) => {
    expect(changesOf(sql)).toEqual([change]);
  });

  it('turns TRUNCATE of several tables into one DeleteRows each', () => {
    expect(changesOf('TRUNCATE "U", "public"."P";')).toEqual([
      { kind: 'DeleteRows', table: 'U' },
      { kind: 'DeleteRows', table: 'P' },
    ]);
  });

  it('turns DROP TYPE of several enums into one DropEnum each', () => {
    expect(changesOf('DROP TYPE "Role", "public"."Old";')).toEqual([
      { kind: 'DropEnum', enumName: 'Role' },
      { kind: 'DropEnum', enumName: 'Old' },
    ]);
  });

  describe('fails closed', () => {
    it.each([
      'CREATE UNIQUE INDEX "u_lower" ON "U"(lower("email"))',
      "ALTER TYPE \"Role\" RENAME VALUE 'A' TO 'AA'",
      'UPDATE "auth"."U" SET "a" = 1',
      'TRUNCATE "auth"."U"',
      'DROP TYPE "auth"."Role"',
      'CREATE TYPE "auth"."Role" AS ENUM (\'A\')',
      'ALTER TABLE "U" ADD CONSTRAINT "u_excl" EXCLUDE USING gist ("a" WITH =)',
    ])('marks %s as Unrecognized', (sql) => {
      expect(changesOf(`${sql};`)).toEqual([{ kind: 'Unrecognized', sql }]);
    });
  });
});
