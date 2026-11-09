import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-004 (RULES.md §4): a column base uses is renamed. UNSAFE, like a drop: base selects every
 * scalar column, so every query on the model fails. Prisma renames a field with DROP + ADD
 * (RG-DB-002, RG-DB-005); this catches hand-written renames.
 */
export const renameColumnRule: Rule<'RenameColumn'> = {
  id: 'RG-DB-004',
  appliesTo: ['RenameColumn'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    const column = table?.columns.get(change.from);
    if (table === undefined || column === undefined) return [];
    return [
      {
        severity: 'UNSAFE',
        target: `"${change.table}"."${change.from}"`,
        reason: `Base selects every scalar column of model ${table.model}, including "${change.from}" (${table.model}.${column.field}), so every query on it fails after the rename to "${change.to}".`,
        fix: `Keep the column name and rename only the field (@map("${change.from}")), or follow the 4-release rename (RULES.md §5).`,
      },
    ];
  },
};
