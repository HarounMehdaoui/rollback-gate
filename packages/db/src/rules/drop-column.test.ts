import { describe, expect, it } from 'vitest';

import { dropColumnRule } from './drop-column.js';
import { baseSchema, contextFrom } from './test-used-set.js';

const ctx = contextFrom(baseSchema);
const drop = (table: string, column: string) =>
  dropColumnRule.evaluate({ kind: 'DropColumn', table, column }, ctx);

describe('RG-DB-002 drop column', () => {
  it('flags a dropped column base uses as UNSAFE, naming the Prisma field', () => {
    expect(drop('users', 'full_name')).toEqual([
      {
        severity: 'UNSAFE',
        target: '"users"."full_name"',
        reason:
          'Base selects every scalar column of model User, so every query on it fails once User.name is gone.',
        fix: 'Retire User.name first (@ignore it, stop writing it, make it optional if it is required), then drop the column one release later.',
      },
    ]);
  });

  it('emits no finding when the dropped column is @ignore', () => {
    expect(drop('users', 'legacy')).toEqual([]);
  });

  it('emits no finding for a column base does not know (e.g. added in this release)', () => {
    expect(drop('users', 'nickname')).toEqual([]);
  });

  it('emits no finding for a column of an @@ignore model', () => {
    expect(drop('AuditLog', 'id')).toEqual([]);
  });

  it('emits no finding for a column of a table base does not know', () => {
    expect(drop('temp_import', 'id')).toEqual([]);
  });
});
