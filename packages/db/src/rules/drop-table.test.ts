import { describe, expect, it } from 'vitest';

import { dropTableRule } from './drop-table.js';
import { baseSchema, contextFrom } from './test-used-set.js';

const ctx = contextFrom(baseSchema);

describe('RG-DB-001 drop table', () => {
  it('flags a dropped table base uses as UNSAFE', () => {
    expect(dropTableRule.evaluate({ kind: 'DropTable', table: 'users' }, ctx)).toEqual([
      {
        severity: 'UNSAFE',
        target: '"users"',
        reason: 'Every base query on model User fails with "relation does not exist".',
        fix: 'Remove model User from the code (or @@ignore it) in one release, and drop the table in the next one.',
      },
    ]);
  });

  it('emits no finding when the dropped table is an @@ignore model', () => {
    expect(dropTableRule.evaluate({ kind: 'DropTable', table: 'AuditLog' }, ctx)).toEqual([]);
  });

  it('emits no finding when base does not know the table', () => {
    expect(dropTableRule.evaluate({ kind: 'DropTable', table: 'temp_import' }, ctx)).toEqual([]);
  });

  // The used set is keyed by database name: the Prisma model name isn't a table.
  it('matches the database name, not the model name', () => {
    expect(dropTableRule.evaluate({ kind: 'DropTable', table: 'User' }, ctx)).toEqual([]);
  });
});
