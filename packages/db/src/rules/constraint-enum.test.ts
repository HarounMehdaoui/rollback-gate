import type { Change } from '@rollbackgate/core';
import { describe, expect, it } from 'vitest';

import { enumRenamedRule } from './enum-renamed.js';
import { enumValueAddedRule } from './enum-value-added.js';
import { newCheckRule } from './new-check.js';
import { newForeignKeyRule } from './new-foreign-key.js';
import { newUniqueRule } from './new-unique.js';
import { contextFrom } from './test-used-set.js';
import { uniqueIndexDroppedRule } from './unique-index-dropped.js';

const ctx = contextFrom(`
enum Role {
  USER
  ADMIN
}
enum Unused {
  A
}
model User {
  id     Int     @id(map: "users_pk")
  email  String  @unique
  handle String
  role   Role
  legacy String? @ignore
  old    Unused? @ignore
  @@unique([handle, role])
}
`);
type Kind<K extends Change['kind']> = Extract<Change, { kind: K }>;
const constraint = (over: Partial<Kind<'AddConstraint'>>): Kind<'AddConstraint'> => ({
  kind: 'AddConstraint',
  table: 'User',
  constraint: 'unique',
  columns: ['handle'],
  ...over,
});

describe('RG-DB-012 new unique constraint or primary key', () => {
  it.each([
    [{ kind: 'CreateUniqueIndex', table: 'User', columns: ['handle'] }, '"User"("handle")'],
    [constraint({}), '"User"("handle")'],
    [constraint({ constraint: 'primaryKey', columns: ['id', 'handle'] }), '"User"("id", "handle")'],
    [
      { kind: 'CreateUniqueIndex', table: 'User', columns: ['nickname', 'handle'] },
      '"User"("nickname", "handle")',
    ],
  ] as const)('flags %o on a used column as RISKY', (change, target) => {
    expect(newUniqueRule.evaluate(change, ctx)).toMatchObject([{ severity: 'RISKY', target }]);
  });

  it.each([
    { kind: 'CreateUniqueIndex', table: 'User', columns: ['legacy'] },
    { kind: 'CreateUniqueIndex', table: 'Post', columns: ['id'] },
    constraint({ constraint: 'check' }),
    constraint({ constraint: 'foreignKey' }),
  ] as const)('emits no finding for %o', (change) => {
    expect(newUniqueRule.evaluate(change, ctx)).toEqual([]);
  });
});

describe('RG-DB-013 new CHECK constraint', () => {
  it('flags a CHECK on a used table as RISKY, naming it', () => {
    const [hit] = newCheckRule.evaluate(
      constraint({ constraint: 'check', columns: [], name: 'pos' }),
      ctx,
    );

    expect(hit).toMatchObject({ severity: 'RISKY', target: '"User"."pos"' });
  });

  it.each([
    constraint({ constraint: 'check', table: 'Post' }),
    constraint({ constraint: 'unique' }),
  ])('emits no finding for %o', (change) => {
    expect(newCheckRule.evaluate(change, ctx)).toEqual([]);
  });
});

describe('RG-DB-014 new foreign key', () => {
  it('flags a foreign key on a used table as RISKY', () => {
    expect(
      newForeignKeyRule.evaluate(constraint({ constraint: 'foreignKey', columns: ['id'] }), ctx),
    ).toMatchObject([{ severity: 'RISKY', target: '"User"("id")' }]);
  });

  it('emits no finding on a table base does not use', () => {
    expect(
      newForeignKeyRule.evaluate(constraint({ constraint: 'foreignKey', table: 'Post' }), ctx),
    ).toEqual([]);
  });
});

describe('RG-DB-023 unique index dropped that base relies on', () => {
  it.each(['User_email_key', 'User_handle_role_key', 'users_pk'])(
    'flags dropping %s as RISKY',
    (name) => {
      const [hit] = uniqueIndexDroppedRule.evaluate({ kind: 'DropIndex', name }, ctx);

      expect(hit).toMatchObject({ severity: 'RISKY', target: `"${name}"` });
      expect(hit?.reason).toContain('P2039');
    },
  );

  it('flags dropping the constraint form on the same table', () => {
    expect(
      uniqueIndexDroppedRule.evaluate(
        { kind: 'DropConstraint', table: 'User', name: 'users_pk' },
        ctx,
      ),
    ).toMatchObject([{ severity: 'RISKY' }]);
  });

  it.each([
    { kind: 'DropIndex', name: 'User_handle_idx' },
    { kind: 'DropConstraint', table: 'Other', name: 'users_pk' },
  ] as const)('emits no finding for %o', (change) => {
    expect(uniqueIndexDroppedRule.evaluate(change, ctx)).toEqual([]);
  });
});

describe('RG-DB-015 enum value added', () => {
  it('flags a value added to a used enum as RISKY, naming the value', () => {
    const [hit] = enumValueAddedRule.evaluate(
      { kind: 'AddEnumValue', enumName: 'Role', value: 'OWNER' },
      ctx,
    );

    expect(hit).toMatchObject({ severity: 'RISKY', target: '"Role"' });
    expect(hit?.reason).toContain("'OWNER'");
  });

  it.each(['Unused', 'Other'])(
    'emits no finding for enum %s, which base does not use',
    (enumName) => {
      expect(
        enumValueAddedRule.evaluate({ kind: 'AddEnumValue', enumName, value: 'X' }, ctx),
      ).toEqual([]);
    },
  );
});

describe('RG-DB-017 enum type renamed', () => {
  it('flags renaming a used enum as UNSAFE', () => {
    expect(
      enumRenamedRule.evaluate({ kind: 'RenameEnum', from: 'Role', to: 'user_role' }, ctx),
    ).toMatchObject([
      {
        severity: 'UNSAFE',
        target: '"Role"',
        fix: expect.stringContaining('@@map("Role")') as unknown,
      },
    ]);
  });

  it('emits no finding for an enum base does not use', () => {
    expect(enumRenamedRule.evaluate({ kind: 'RenameEnum', from: 'Unused', to: 'x' }, ctx)).toEqual(
      [],
    );
  });
});
