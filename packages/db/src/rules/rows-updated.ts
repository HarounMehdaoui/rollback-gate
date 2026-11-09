import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-018 (RULES.md §4): an UPDATE rewrites at least one column base uses. RISKY: base may misread
 * the new values (format, units, meaning). The backfill exception needs no special case: columns
 * added in this release, like `@ignore` columns, are never in base's used set.
 */
export const rowsUpdatedRule: Rule<'UpdateRows'> = {
  id: 'RG-DB-018',
  appliesTo: ['UpdateRows'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    const used = change.columns.filter((c) => table?.columns.has(c) === true);
    if (table === undefined || used.length === 0) return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.table}"(${used.map((c) => `"${c}"`).join(', ')})`,
        reason: `Base reads ${used.length === 1 ? 'a column' : 'columns'} of model ${table.model} that this release rewrites, and may interpret the new values wrongly.`,
        fix: 'Write transformed data to a new column (expand/contract) instead of rewriting a column base reads.',
      },
    ];
  },
};
