import type { Rule } from '@rollbackgate/core';

import { classifyTypeChange, scalarCoversType } from './type-compat.js';

/**
 * RG-DB-007 (RULES.md §4): a used column is widened beyond what base's Prisma scalar can represent
 * (an `Int` column → `int8`). RISKY: Prisma reads the value without an error but may get it wrong.
 * No finding when the scalar still covers the new type (`varchar(50)` → `text` is still a String).
 */
export const typeWideningRule: Rule<'AlterColumnType'> = {
  id: 'RG-DB-007',
  appliesTo: ['AlterColumnType'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    const column = table?.columns.get(change.column);
    if (table === undefined || column?.nativeType == null || change.hasUsing) return [];
    if (classifyTypeChange(column.nativeType, change.toType) !== 'widening') return [];
    if (scalarCoversType(column.prismaType, change.toType)) return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.table}"."${change.column}"`,
        reason: `The column widens from ${column.nativeType} to ${change.toType}, beyond what base's ${column.prismaType} field ${table.model}.${column.field} can hold: Prisma reads such values without an error, but they can come back wrong (a bigint is exact only up to 2^53).`,
        fix: `Widen base's schema type first (for example BigInt), then widen the column one release later.`,
      },
    ];
  },
};
