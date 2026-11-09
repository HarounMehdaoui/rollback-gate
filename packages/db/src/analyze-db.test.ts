import type { MigrationFile, Snapshot } from '@rollbackgate/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { analyzeDb, collectDbChanges, UnusableBaseSchemaError } from './analyze-db.js';
import { initSqlParser } from './sql/parse-sql.js';

beforeAll(async () => {
  await initSqlParser();
});

const schema = (fields: string) =>
  `datasource db {\n  provider = "postgresql"\n}\nmodel User {\n  id Int @id\n${fields}}\n`;
const migration = (name: string, sql: string, sha256 = name): MigrationFile => ({
  name,
  sql,
  sha256,
});
const snapshot = (prismaSchema: string, ...migrations: MigrationFile[]): Snapshot => ({
  ref: 'test',
  prismaSchema,
  migrations,
});

const init = migration(
  '1_init',
  'CREATE TABLE "User" ("id" INTEGER NOT NULL, "name" TEXT NOT NULL);',
);
const base = snapshot(schema('  name String\n'), init);

describe('analyzeDb', () => {
  it('flags a used column dropped by a new migration, with its statement as source', () => {
    const head = snapshot(
      schema(''),
      init,
      migration('2_drop', 'BEGIN;\nALTER TABLE "User" DROP COLUMN "name";\nCOMMIT;'),
    );

    expect(analyzeDb(base, head)).toEqual([
      expect.objectContaining({
        ruleId: 'RG-DB-002',
        severity: 'UNSAFE',
        target: '"User"."name"',
        source: { kind: 'statement', migration: '2_drop', statementIndex: 1 },
      }),
    ]);
  });

  it('checks only new migrations: base’s own history is not re-analyzed', () => {
    const baseWithDrop = snapshot(
      schema(''),
      init,
      migration('2_drop', 'ALTER TABLE "User" DROP COLUMN "name";'),
    );

    expect(analyzeDb(baseWithDrop, baseWithDrop)).toEqual([]);
  });

  it('reads the used set from base, not head', () => {
    const baseIgnoring = snapshot(schema('  name String? @ignore\n'), init);
    const head = snapshot(
      schema('  name String\n'),
      init,
      migration('2_drop', 'ALTER TABLE "User" DROP COLUMN "name";'),
    );

    expect(analyzeDb(baseIgnoring, head)).toEqual([]);
  });

  it('throws a tool error when base’s schema can’t be used, instead of returning no findings', () => {
    const head = snapshot(schema(''), migration('2_drop', 'DROP TABLE "User";'));

    expect(() => analyzeDb(snapshot(''), head)).toThrow(UnusableBaseSchemaError);
  });
});

describe('collectDbChanges', () => {
  it('turns a migration that doesn’t parse into one Unparsable change for the whole file', () => {
    const head = snapshot(
      schema('  name String\n'),
      init,
      migration('2_bad', 'ALTER TABLE "User" DROPP "x";'),
    );

    expect(collectDbChanges(base, head).changes).toEqual([
      {
        change: {
          kind: 'Unparsable',
          sql: 'ALTER TABLE "User" DROPP "x";',
          error: 'syntax error at or near "DROPP" at offset 19',
        },
        source: { kind: 'migration', migration: '2_bad' },
      },
    ]);
  });

  it('puts history changes first, then new migrations in apply order', () => {
    const head = snapshot(
      schema('  name String\n'),
      migration('1_init', init.sql, 'edited'),
      migration('2_a', 'CREATE TABLE "A" (id int);'),
      migration('3_b', 'CREATE EXTENSION "pgcrypto";'),
    );

    expect(collectDbChanges(base, head).changes.map((c) => c.change.kind)).toEqual([
      'EditedMigration',
      'CreateTable',
      'Unrecognized',
    ]);
  });
});
