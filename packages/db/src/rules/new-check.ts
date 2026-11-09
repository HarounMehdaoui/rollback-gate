import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-013 (RULES.md §4): a CHECK constraint on a table base uses. RISKY: base breaks only for values
 * that violate it. The expression isn't analysed, so any CHECK on a used table counts.
 */
export const newCheckRule: Rule<'AddConstraint'> = {
  id: 'RG-DB-013',
  appliesTo: ['AddConstraint'],
  evaluate(change, { usedSet }) {
    if (change.constraint !== 'check') return [];
    const table = usedSet.tables.get(change.table);
    if (table === undefined) return [];
    const name =
      change.name === undefined ? 'A new CHECK constraint' : `CHECK constraint "${change.name}"`;
    return [
      {
        severity: 'RISKY',
        target:
          change.name === undefined ? `"${change.table}"` : `"${change.table}"."${change.name}"`,
        reason: `${name} on model ${table.model}'s table: base writes that violate it now fail.`,
        fix: 'Enforce the same condition in code one release before adding the constraint, or add it NOT VALID and validate it later.',
      },
    ];
  },
};
