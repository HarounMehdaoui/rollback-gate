import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-012 (RULES.md §4): a unique index, unique constraint or primary key on at least one column
 * base uses. RISKY: base breaks only when it writes a duplicate.
 */
export const newUniqueRule: Rule<'CreateUniqueIndex' | 'AddConstraint'> = {
  id: 'RG-DB-012',
  appliesTo: ['CreateUniqueIndex', 'AddConstraint'],
  evaluate(change, { usedSet }) {
    if (
      change.kind === 'AddConstraint' &&
      change.constraint !== 'unique' &&
      change.constraint !== 'primaryKey'
    ) {
      return [];
    }
    const table = usedSet.tables.get(change.table);
    if (table === undefined || !change.columns.some((c) => table.columns.has(c))) return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.table}"(${change.columns.map((c) => `"${c}"`).join(', ')})`,
        reason: `Base writes to model ${table.model} that create a duplicate value now fail with a unique violation.`,
        fix: 'Add @unique to the schema (and handle the conflict in code) one release before adding the index.',
      },
    ];
  },
};
