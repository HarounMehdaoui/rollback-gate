import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-014 (RULES.md §4): a foreign key on a table base uses. RISKY: base breaks only if it writes an
 * orphan reference or deletes a parent row that still has children.
 */
export const newForeignKeyRule: Rule<'AddConstraint'> = {
  id: 'RG-DB-014',
  appliesTo: ['AddConstraint'],
  evaluate(change, { usedSet }) {
    if (change.constraint !== 'foreignKey') return [];
    const table = usedSet.tables.get(change.table);
    if (table === undefined) return [];
    return [
      {
        severity: 'RISKY',
        target: `"${change.table}"(${change.columns.map((c) => `"${c}"`).join(', ')})`,
        reason: `Base inserts into model ${table.model} with a missing parent, or deletes of a parent it still references, now fail.`,
        fix: 'Add the relation to the schema and make the code respect it one release before adding the foreign key.',
      },
    ];
  },
};
