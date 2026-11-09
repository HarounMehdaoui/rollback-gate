import type { Rule } from '@rollbackgate/core';

import { classifyTypeChange } from './type-compat.js';

/**
 * RG-DB-008 (RULES.md §4): a used column's type changes in a way the tool can't classify: an
 * unrelated type, a `USING` cast, or a base type that couldn't be resolved. UNSAFE, fail-closed.
 */
export const unknownTypeChangeRule: Rule<'AlterColumnType'> = {
  id: 'RG-DB-008',
  appliesTo: ['AlterColumnType'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    const column = table?.columns.get(change.column);
    if (table === undefined || column === undefined) return [];
    const from = column.nativeType;
    const why =
      from === null
        ? `base's type for ${table.model}.${column.field} couldn't be resolved`
        : change.hasUsing
          ? `the change from ${from} to ${change.toType} converts values with a USING cast`
          : classifyTypeChange(from, change.toType) === 'unknown'
            ? `${from} → ${change.toType} isn't a known widening or narrowing`
            : null;
    if (why === null) return [];
    return [
      {
        severity: 'UNSAFE',
        target: `"${change.table}"."${change.column}"`,
        reason: `Rollback Gate can't prove base can still read and write this column: ${why}.`,
        fix: 'Add a new column with the new type and move to it with expand/contract, or, if you know it is safe, document it and use an override.',
      },
    ];
  },
};
