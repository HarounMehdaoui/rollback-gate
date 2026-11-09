import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-005 (RULES.md §4): a NOT NULL column without a default is added to a table base uses.
 * UNSAFE: base doesn't know the column, so every base insert into the table violates NOT NULL.
 */
export const requiredColumnAddedRule: Rule<'AddColumn'> = {
  id: 'RG-DB-005',
  appliesTo: ['AddColumn'],
  evaluate(change, { usedSet }) {
    if (change.isNullable || change.hasDefault) return [];
    const table = usedSet.tables.get(change.table);
    if (table === undefined) return [];
    return [
      {
        severity: 'UNSAFE',
        target: `"${change.table}"."${change.column}"`,
        reason: `Base doesn't know column "${change.column}", so every base insert into model ${table.model} fails with a NOT NULL violation.`,
        fix: 'Add the column as nullable or with a default, and make it required in a later release.',
      },
    ];
  },
};
