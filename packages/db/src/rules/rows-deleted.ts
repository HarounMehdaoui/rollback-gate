import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-019 (RULES.md §4): rows are deleted from a table base uses (DELETE or TRUNCATE). RISKY: base
 * usually copes with fewer rows, and breaks only where it expects specific ones (lookups, seeds).
 */
export const rowsDeletedRule: Rule<'DeleteRows'> = {
  id: 'RG-DB-019',
  appliesTo: ['DeleteRows'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    if (table === undefined) return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.table}"`,
        reason: `Base code that expects the deleted ${table.model} rows (lookups, seeds, references) fails or misbehaves.`,
        fix: 'Soft-delete, or delete in a later release once base no longer reads those rows.',
      },
    ];
  },
};
