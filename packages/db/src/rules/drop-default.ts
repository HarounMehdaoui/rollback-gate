import type { Rule } from '@rollbackgate/core';

// Prisma 7 sends every other default itself (now(), literals, enums, uuid(), cuid()), so dropping the
// database default doesn't affect base (RULES.md §6 row 5).
const databaseDefaults = ['autoincrement(', 'dbgenerated('];

/**
 * RG-DB-011 (RULES.md §4): a database-applied default base relies on is dropped. UNSAFE on a NOT NULL
 * column (base's inserts fail), RISKY on a nullable one (they store NULL instead).
 */
export const dropDefaultRule: Rule<'DropDefault'> = {
  id: 'RG-DB-011',
  appliesTo: ['DropDefault'],
  evaluate(change, { usedSet }) {
    const table = usedSet.tables.get(change.table);
    const column = table?.columns.get(change.column);
    const fallback = column?.default;
    if (table === undefined || column === undefined || fallback === undefined) return [];
    if (!databaseDefaults.some((prefix) => fallback.startsWith(prefix))) return [];
    const field = `${table.model}.${column.field}`;
    return [
      column.isOptional
        ? {
            severity: 'RISKY',
            target: `"${change.table}"."${change.column}"`,
            reason: `Base relies on the database to fill ${field} (@default(${fallback})); without it, base's inserts store NULL instead.`,
            fix: 'Keep the default until base sets the value itself, then drop it one release later.',
          }
        : {
            severity: 'UNSAFE',
            target: `"${change.table}"."${change.column}"`,
            reason: `Base relies on the database to fill the required ${field} (@default(${fallback})); without it, every base insert fails with a NOT NULL violation.`,
            fix: 'Keep the default until base sets the value itself, then drop it one release later.',
          },
    ];
  },
};
