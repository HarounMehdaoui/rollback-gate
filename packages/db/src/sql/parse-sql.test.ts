import { beforeAll, describe, expect, it } from 'vitest';

import { initSqlParser, parseSql, type SqlParseResult } from './parse-sql.js';

function statementsOf(result: SqlParseResult) {
  if (!result.ok) throw new Error(result.error.message);
  return result.statements;
}

describe('parseSql before initialization', () => {
  // Must run before beforeAll below: module state is shared within this file.
  it('throws a clear programmer error instead of reporting the SQL as unparsable', () => {
    expect(() => parseSql('SELECT 1')).toThrow('before initSqlParser() finished');
  });
});

describe('parseSql', () => {
  beforeAll(async () => {
    await initSqlParser();
  });

  it('parses a multi-statement migration, keeping each statement’s index, offset and text', () => {
    const sql = 'CREATE TABLE "a" (id int);\n\nDROP TABLE "b";\n';

    const statements = statementsOf(parseSql(sql));

    expect(statements.map((s) => [s.index, s.offset, s.text])).toEqual([
      [0, 0, 'CREATE TABLE "a" (id int)'],
      [1, 28, 'DROP TABLE "b"'],
    ]);
    expect(Object.keys(statements[1]?.node ?? {})).toEqual(['DropStmt']);
  });

  // é is 2 bytes in UTF-8; 😀 is 4 bytes and 2 JavaScript code units.
  it('counts offsets in string positions even after non-ASCII comments', () => {
    const sql = '-- café 😀\nDROP TABLE "é";\nSELECT 1';

    const statements = statementsOf(parseSql(sql));

    expect(statements.map((s) => [s.offset, s.text])).toEqual([
      [11, 'DROP TABLE "é"'],
      [27, 'SELECT 1'],
    ]);
  });

  it('keeps a multi-action ALTER TABLE as one statement (the normalizer splits it)', () => {
    const statements = statementsOf(
      parseSql('ALTER TABLE "User" DROP COLUMN "name", ADD COLUMN "fullName" TEXT NOT NULL;'),
    );

    expect(statements).toHaveLength(1);
  });

  it('parses Prisma’s transaction wrapper as ordinary statements', () => {
    const statements = statementsOf(parseSql('BEGIN;\nDROP TYPE "Role_old";\nCOMMIT;'));

    expect(statements.map((s) => Object.keys(s.node)[0])).toEqual([
      'TransactionStmt',
      'DropStmt',
      'TransactionStmt',
    ]);
  });

  it('returns no statements for a migration with only comments', () => {
    expect(statementsOf(parseSql('-- This is an empty migration.'))).toEqual([]);
  });

  it('returns an error with its position for invalid SQL, without throwing', () => {
    const result = parseSql('CREATE TABLE ok (id int);\nALTER TABLE x DROPP COLUMN y;');

    expect(result).toEqual({
      ok: false,
      error: { message: 'syntax error at or near "DROPP"', offset: 40 },
    });
  });

  it('rejects the whole file when any statement is invalid', () => {
    expect(parseSql('SELECT 1;\nSELEC 2;').ok).toBe(false);
  });
});
