import type { Rule } from '@rollbackgate/core';

import { classifyTypeChange } from './type-compat.js';

/**
 * RG-DB-006 (RULES.md §4): a used column's type is narrowed (the reverse of a known widening). RISKY:
 * base breaks only when it writes a value that no longer fits.
 */
export const typeNarrowingRule: Rule<'AlterColumnType'> = {
  id: 'RG-DB-006',
  appliesTo: ['AlterColumnType'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    const column = table?.columns.get(change.column);
    if (table === undefined || column?.nativeType == null || change.hasUsing) return [];
    if (classifyTypeChange(column.nativeType, change.toType) !== 'narrowing') return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.table}"."${change.column}"`,
        reason: `The column narrows from ${column.nativeType} to ${change.toType}: base writes to ${table.model}.${column.field} that don't fit fail (value too long, out of range).`,
        fix: "Keep the wider type, or first change base's schema (@db.*) so base never writes values that don't fit, then narrow one release later.",
      },
    ];
  },
};
