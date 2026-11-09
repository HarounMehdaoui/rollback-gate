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
  return normalizeMigration('1_test', parsed.statements).map((c) => c.change);
}

describe('normalizeMigration', () => {
  describe('tables', () => {
    it('turns CREATE TABLE into CreateTable', () => {
      expect(
        changesOf(
          'CREATE TABLE "Post" ("id" SERIAL NOT NULL, CONSTRAINT "Post_pkey" PRIMARY KEY ("id"));',
        ),
      ).toEqual([{ kind: 'CreateTable', table: 'Post' }]);
    });

    it('turns DROP TABLE with several tables into one DropTable each', () => {
      expect(changesOf('DROP TABLE "User", "public"."Post";')).toEqual([
        { kind: 'DropTable', table: 'User' },
        { kind: 'DropTable', table: 'Post' },
      ]);
    });

    it('turns ALTER TABLE … RENAME TO into RenameTable', () => {
      expect(changesOf('ALTER TABLE "User" RENAME TO "Person";')).toEqual([
        { kind: 'RenameTable', from: 'User', to: 'Person' },
      ]);
    });
  });

  describe('columns', () => {
    it('turns DROP COLUMN into DropColumn', () => {
      expect(changesOf('ALTER TABLE "User" DROP COLUMN "name";')).toEqual([
        { kind: 'DropColumn', table: 'User', column: 'name' },
      ]);
    });

    it('turns RENAME COLUMN into RenameColumn', () => {
      expect(changesOf('ALTER TABLE "User" RENAME COLUMN "name" TO "fullName";')).toEqual([
        { kind: 'RenameColumn', table: 'User', from: 'name', to: 'fullName' },
      ]);
    });

    it.each([
      ['TEXT', true, false],
      ['TEXT NOT NULL', false, false],
      ["TEXT NOT NULL DEFAULT 'x'", false, true],
      ['SERIAL', true, true],
      ['INTEGER GENERATED ALWAYS AS IDENTITY', false, true],
      ['INTEGER PRIMARY KEY', false, false],
    ])(
      'turns ADD COLUMN "c" %s into AddColumn (nullable %s, default %s)',
      (def, isNullable, hasDefault) => {
        expect(changesOf(`ALTER TABLE "User" ADD COLUMN "c" ${def};`)[0]).toEqual({
          kind: 'AddColumn',
          table: 'User',
          column: 'c',
          isNullable,
          hasDefault,
        });
      },
    );

    it('keeps a constraint declared on an added column', () => {
      expect(
        changesOf('ALTER TABLE "User" ADD COLUMN "email" TEXT CONSTRAINT "User_email_key" UNIQUE;'),
      ).toEqual([
        { kind: 'AddColumn', table: 'User', column: 'email', isNullable: true, hasDefault: false },
        {
          kind: 'AddConstraint',
          table: 'User',
          constraint: 'unique',
          columns: ['email'],
          name: 'User_email_key',
        },
      ]);
    });

    // RULES.md §6 row 1: Prisma's own SQL for renaming a field.
    it('splits Prisma’s rename (one ALTER TABLE, two actions) into one change per action', () => {
      expect(
        changesOf('ALTER TABLE "User" DROP COLUMN "name",\nADD COLUMN "fullName" TEXT NOT NULL;'),
      ).toEqual([
        { kind: 'DropColumn', table: 'User', column: 'name' },
        {
          kind: 'AddColumn',
          table: 'User',
          column: 'fullName',
          isNullable: false,
          hasDefault: false,
        },
      ]);
    });
  });

  describe('identifiers', () => {
    it('lower-cases unquoted names, as Postgres does', () => {
      expect(changesOf('ALTER TABLE Users DROP COLUMN FullName;')).toEqual([
        { kind: 'DropColumn', table: 'users', column: 'fullname' },
      ]);
    });

    it('accepts a "public". prefix', () => {
      expect(changesOf('ALTER TABLE "public"."User" DROP COLUMN "name";')).toEqual([
        { kind: 'DropColumn', table: 'User', column: 'name' },
      ]);
    });
  });

  describe('fails closed', () => {
    it.each([
      'ALTER TABLE "auth"."User" DROP COLUMN "name";',
      'DROP TABLE "auth"."User";',
      'CREATE TABLE auth.t (id int);',
      'ALTER TABLE "auth"."User" RENAME TO "Person";',
    ])('marks a statement on another schema as Unrecognized: %s', (sql) => {
      expect(changesOf(sql)).toEqual([{ kind: 'Unrecognized', sql: sql.slice(0, -1) }]);
    });

    it('marks a statement no normalizer models as Unrecognized, with its text', () => {
      expect(changesOf('CREATE EXTENSION IF NOT EXISTS "pgcrypto";')).toEqual([
        { kind: 'Unrecognized', sql: 'CREATE EXTENSION IF NOT EXISTS "pgcrypto"' },
      ]);
    });

    it('keeps the known actions of an ALTER TABLE and adds Unrecognized for the unknown one', () => {
      const sql = 'ALTER TABLE "User" DROP COLUMN "a", ENABLE ROW LEVEL SECURITY';

      expect(changesOf(sql)).toEqual([
        { kind: 'DropColumn', table: 'User', column: 'a' },
        { kind: 'Unrecognized', sql },
      ]);
    });

    it('marks a DROP of an object it does not model as Unrecognized', () => {
      expect(changesOf('DROP SEQUENCE "User_id_seq";')).toEqual([
        { kind: 'Unrecognized', sql: 'DROP SEQUENCE "User_id_seq"' },
      ]);
    });

    it('marks ROLLBACK as Unrecognized: it isn’t part of a normal migration', () => {
      expect(changesOf('ROLLBACK;')).toEqual([{ kind: 'Unrecognized', sql: 'ROLLBACK' }]);
    });
  });

  it('produces nothing for BEGIN, COMMIT and CREATE SCHEMA IF NOT EXISTS "public"', () => {
    expect(changesOf('BEGIN;\nCREATE SCHEMA IF NOT EXISTS "public";\nCOMMIT;')).toEqual([]);
  });

  it('tags each change with its migration and statement index', () => {
    const parsed = parseSql('BEGIN;\nALTER TABLE "User" DROP COLUMN "a";\nCOMMIT;');
    if (!parsed.ok) throw new Error(parsed.error.message);

    expect(normalizeMigration('2_drop', parsed.statements)).toEqual([
      {
        change: { kind: 'DropColumn', table: 'User', column: 'a' },
        source: { kind: 'statement', migration: '2_drop', statementIndex: 1 },
      },
    ]);
  });
});
