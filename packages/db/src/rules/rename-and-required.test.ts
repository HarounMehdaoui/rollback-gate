import type { Change } from '@rollbackgate/core';
import { describe, expect, it } from 'vitest';

import { renameColumnRule } from './rename-column.js';
import { renameTableRule } from './rename-table.js';
import { requiredColumnAddedRule } from './required-column-added.js';
import { baseSchema, contextFrom } from './test-used-set.js';

const ctx = contextFrom(baseSchema);
const addColumn = (over: Partial<Extract<Change, { kind: 'AddColumn' }>>) =>
  requiredColumnAddedRule.evaluate(
    {
      kind: 'AddColumn',
      table: 'users',
      column: 'email',
      isNullable: false,
      hasDefault: false,
      ...over,
    },
    ctx,
  );

describe('RG-DB-003 rename table', () => {
  it('flags renaming a table base uses as UNSAFE', () => {
    expect(
      renameTableRule.evaluate({ kind: 'RenameTable', from: 'users', to: 'people' }, ctx),
    ).toEqual([
      {
        severity: 'UNSAFE',
        target: '"users"',
        reason:
          'Base queries model User as table "users", which no longer exists after the rename to "people".',
        fix: 'Keep the table name and rename only the model (@@map("users")), or move to the new table over several releases (expand/contract).',
      },
    ]);
  });

  it.each(['AuditLog', 'temp_import'])(
    'emits no finding for a table base does not use (%s)',
    (from) => {
      expect(renameTableRule.evaluate({ kind: 'RenameTable', from, to: 'x' }, ctx)).toEqual([]);
    },
  );
});

describe('RG-DB-004 rename column', () => {
  it('flags renaming a column base uses as UNSAFE', () => {
    const [hit] = renameColumnRule.evaluate(
      { kind: 'RenameColumn', table: 'users', from: 'full_name', to: 'display_name' },
      ctx,
    );

    expect(hit).toMatchObject({ severity: 'UNSAFE', target: '"users"."full_name"' });
    expect(hit?.reason).toContain('(User.name)');
    expect(hit?.fix).toContain('@map("full_name")');
  });

  it.each([
    ['users', 'legacy'],
    ['users', 'nickname'],
    ['temp_import', 'id'],
  ])('emits no finding for %s.%s, which base does not use', (table, from) => {
    expect(renameColumnRule.evaluate({ kind: 'RenameColumn', table, from, to: 'x' }, ctx)).toEqual(
      [],
    );
  });
});

describe('RG-DB-005 required column added', () => {
  it('flags a NOT NULL column without a default on a used table as UNSAFE', () => {
    expect(addColumn({})).toEqual([
      {
        severity: 'UNSAFE',
        target: '"users"."email"',
        reason:
          'Base doesn\'t know column "email", so every base insert into model User fails with a NOT NULL violation.',
        fix: 'Add the column as nullable or with a default, and make it required in a later release.',
      },
    ]);
  });

  it('emits no finding for a nullable column', () => {
    expect(addColumn({ isNullable: true })).toEqual([]);
  });

  it('emits no finding for a column with a default', () => {
    expect(addColumn({ hasDefault: true })).toEqual([]);
  });

  it('emits no finding on a table base does not use (e.g. created in this release)', () => {
    expect(addColumn({ table: 'posts' })).toEqual([]);
  });
});
