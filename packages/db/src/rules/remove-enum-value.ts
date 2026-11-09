import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-016 (RULES.md §4): a value is removed from an enum base uses. RISKY: base breaks only on the
 * code paths that write that value. Produced only by the enum recreate recognizer (ADR-0006).
 */
export const removeEnumValueRule: Rule<'RemoveEnumValue'> = {
  id: 'RG-DB-016',
  appliesTo: ['RemoveEnumValue'],
  evaluate(change, { usedSet }) {
    if (!usedSet.enums.has(change.enumName)) return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.enumName}".'${change.value}'`,
        reason: `Base writes that use '${change.value}' fail with "invalid input value for enum ${change.enumName}".`,
        fix: 'Stop writing the value in one release, and remove it one release later.',
      },
    ];
  },
};
