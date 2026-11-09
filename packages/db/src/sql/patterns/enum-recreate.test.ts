import type { Change, UsedSet } from '@rollbackgate/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { contextFrom } from '../../rules/test-used-set.js';
import { normalizeMigration } from '../normalize.js';
import { initSqlParser, parseSql } from '../parse-sql.js';
import { recognizeEnumRecreate } from './enum-recreate.js';

beforeAll(async () => {
  await initSqlParser();
});

const { usedSet } = contextFrom(`
enum Role {
  USER
  ADMIN
  GUEST
}
model U {
  id    Int    @id
  role  Role   @default(USER)
  roles Role[]
}
model V {
  id Int  @id
  r  Role
}
`);

function recognize(sql: string, base: UsedSet = usedSet): Change[] {
  const parsed = parseSql(sql);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return recognizeEnumRecreate(normalizeMigration('2_enum', parsed.statements), base).map(
    (c) => c.change,
  );
}

// Verbatim `prisma migrate diff` output, Prisma 7.10.1: GUEST removed; a column with a default and a list.
const removeGuest = `-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "U" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "U" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "U" ALTER COLUMN "roles" TYPE "Role_new"[] USING ("roles"::text::"Role_new"[]);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "U" ALTER COLUMN "role" SET DEFAULT 'USER';
COMMIT;`;

// Same, with ADMIN and GUEST removed, no defaults, and two tables converted.
const removeTwo = `-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('USER');
ALTER TABLE "U" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "V" ALTER COLUMN "r" TYPE "Role_new" USING ("r"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
COMMIT;`;

describe('recognizeEnumRecreate', () => {
  it('replaces Prisma’s recreate sequence with the removed value', () => {
    expect(recognize(removeGuest)).toEqual([
      { kind: 'RemoveEnumValue', enumName: 'Role', value: 'GUEST' },
    ]);
  });

  it('reports every removed value, across several converted tables', () => {
    expect(recognize(removeTwo)).toEqual([
      { kind: 'RemoveEnumValue', enumName: 'Role', value: 'ADMIN' },
      { kind: 'RemoveEnumValue', enumName: 'Role', value: 'GUEST' },
    ]);
  });

  it('sources the removal at the CREATE TYPE statement', () => {
    const parsed = parseSql(removeGuest);
    if (!parsed.ok) throw new Error(parsed.error.message);

    const [removal] = recognizeEnumRecreate(
      normalizeMigration('2_enum', parsed.statements),
      usedSet,
    );

    expect(removal?.source).toEqual({ kind: 'statement', migration: '2_enum', statementIndex: 1 });
  });

  it('keeps the changes before and after the sequence', () => {
    const changes = recognize(
      `ALTER TABLE "U" ADD COLUMN "x" TEXT;\n${removeGuest}\nDROP TABLE "Gone";`,
    );

    expect(changes.map((c) => c.kind)).toEqual(['AddColumn', 'RemoveEnumValue', 'DropTable']);
  });

  it('produces nothing for an enum base does not use', () => {
    const { usedSet: other } = contextFrom('model W {\n  id Int @id\n}\n');

    expect(recognize(removeGuest, other)).toEqual([]);
  });

  describe('fails closed: anything but the exact sequence is left untouched', () => {
    const untouched = (sql: string) => {
      const kinds = recognize(sql).map((c) => c.kind);
      expect(kinds).not.toContain('RemoveEnumValue');
      expect(kinds).toContain('RenameEnum');
    };

    it('when the old type is not dropped', () => {
      untouched(removeGuest.replace('DROP TYPE "Role_old";\n', ''));
    });

    it('when a dropped default is not restored', () => {
      untouched(
        removeGuest.replace('ALTER TABLE "U" ALTER COLUMN "role" SET DEFAULT \'USER\';\n', ''),
      );
    });

    it('when another statement sits inside the sequence', () => {
      untouched(
        removeGuest.replace(
          'ALTER TYPE "Role" RENAME',
          'DELETE FROM "U";\nALTER TYPE "Role" RENAME',
        ),
      );
    });

    it('when a column is converted without USING', () => {
      untouched(removeTwo.replace(' USING ("r"::text::"Role_new")', ''));
    });

    it('when the renames are not Prisma’s _new / _old names', () => {
      untouched(removeTwo.replace('RENAME TO "Role_old"', 'RENAME TO "Role_prev"'));
    });
  });
});
