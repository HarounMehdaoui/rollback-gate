import { describe, expect, it } from 'vitest';

import { rowsDeletedRule } from './rows-deleted.js';
import { rowsUpdatedRule } from './rows-updated.js';
import { baseSchema, contextFrom } from './test-used-set.js';

const ctx = contextFrom(baseSchema);
const update = (columns: string[], table = 'users') =>
  rowsUpdatedRule.evaluate({ kind: 'UpdateRows', table, columns }, ctx);

describe('RG-DB-018 rows updated', () => {
  it('flags an UPDATE of a column base uses as RISKY, listing only the used columns', () => {
    expect(update(['full_name', 'nickname'])).toMatchObject([
      { severity: 'RISKY', target: '"users"("full_name")' },
    ]);
  });

  // The backfill exception: a column added in this release isn't in base's used set.
  it('emits no finding for a backfill of a column added in this release', () => {
    expect(update(['nickname'])).toEqual([]);
  });

  it('emits no finding for an UPDATE of an @ignore column', () => {
    expect(update(['legacy'])).toEqual([]);
  });

  it.each(['AuditLog', 'temp_import'])(
    'emits no finding on table %s, which base does not use',
    (table) => {
      expect(update(['id'], table)).toEqual([]);
    },
  );
});

describe('RG-DB-019 rows deleted', () => {
  it('flags deleting rows from a used table as RISKY', () => {
    expect(rowsDeletedRule.evaluate({ kind: 'DeleteRows', table: 'users' }, ctx)).toMatchObject([
      { severity: 'RISKY', target: '"users"' },
    ]);
  });

  it.each(['AuditLog', 'temp_import'])(
    'emits no finding on table %s, which base does not use',
    (table) => {
      expect(rowsDeletedRule.evaluate({ kind: 'DeleteRows', table }, ctx)).toEqual([]);
    },
  );
});
