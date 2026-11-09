import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-002 (RULES.md §4): a column base uses is dropped. UNSAFE: base's Prisma client selects every
 * scalar column of a model, so every query on the model fails, not only the ones that use the field.
 * An `@ignore` field or a column added in this release isn't in the used set: no finding.
 */
export const dropColumnRule: Rule<'DropColumn'> = {
  id: 'RG-DB-002',
  appliesTo: ['DropColumn'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    const column = table?.columns.get(change.column);
    if (table === undefined || column === undefined) return [];
    return [
      {
        severity: 'UNSAFE',
        target: `"${change.table}"."${change.column}"`,
        reason: `Base selects every scalar column of model ${table.model}, so every query on it fails once ${table.model}.${column.field} is gone.`,
        fix: `Retire ${table.model}.${column.field} first (@ignore it, stop writing it, make it optional if it is required), then drop the column one release later.`,
      },
    ];
  },
};
