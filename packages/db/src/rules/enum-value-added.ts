import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-015 (RULES.md §4): a value is added to an enum base uses. RISKY: base reads of rows holding
 * the new value fail with P2023 (§6 row 7), which happens only once head writes it.
 */
export const enumValueAddedRule: Rule<'AddEnumValue'> = {
  id: 'RG-DB-015',
  appliesTo: ['AddEnumValue'],
  evaluate(change, { usedSet }) {
    if (!usedSet.enums.has(change.enumName)) return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.enumName}"`,
        reason: `Base reads of rows that hold '${change.value}' fail: Prisma raises P2023 "Value '${change.value}' not found in enum".`,
        fix: 'Add the value in one release without writing it, and start writing it one release later.',
      },
    ];
  },
};
