import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-009 (RULES.md §4): NOT NULL is set on a column base treats as optional. RISKY: base breaks
 * only on the code paths that leave the field empty. If base's field is already required, its client
 * never sends NULL: no finding.
 */
export const setNotNullRule: Rule<'SetNotNull'> = {
  id: 'RG-DB-009',
  appliesTo: ['SetNotNull'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    const column = table?.columns.get(change.column);
    if (table === undefined || column === undefined || !column.isOptional) return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.table}"."${change.column}"`,
        reason: `Base's ${table.model}.${column.field} is optional, so base inserts or updates that leave it empty fail with a NOT NULL violation.`,
        fix: 'Make sure base always writes the field before setting NOT NULL, or keep the column nullable.',
      },
    ];
  },
};
