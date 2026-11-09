import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-010 (RULES.md §4): NOT NULL is dropped from a column base treats as required. RISKY: if head
 * writes NULL, Prisma hands base `null` without an error (§6 row 4) and base breaks later, where its
 * code uses the value. If base's field is already optional, base expects NULL: no finding.
 */
export const dropNotNullRule: Rule<'DropNotNull'> = {
  id: 'RG-DB-010',
  appliesTo: ['DropNotNull'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    const column = table?.columns.get(change.column);
    if (table === undefined || column === undefined || column.isOptional) return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.table}"."${change.column}"`,
        reason: `Base's ${table.model}.${column.field} is required: if head writes NULL there, Prisma gives base null without an error, and base breaks later wherever it uses the value.`,
        fix: 'Keep writing the column in this release, and stop writing it one release later (RULES.md §5).',
      },
    ];
  },
};
