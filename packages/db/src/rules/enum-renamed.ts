import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-017 (RULES.md §4): an enum type base uses is renamed. UNSAFE: Prisma casts every enum parameter
 * to the type by name (`CAST($1::text AS "public"."Role")`, §6 row 9), so base's writes to columns of
 * that enum fail. Prisma itself never renames an enum in place; this catches hand-written renames.
 */
export const enumRenamedRule: Rule<'RenameEnum'> = {
  id: 'RG-DB-017',
  appliesTo: ['RenameEnum'],
  evaluate(change, { usedSet }) {
    if (!usedSet.enums.has(change.from)) return [];
    return [
      {
        severity: 'UNSAFE',
        target: `"${change.from}"`,
        reason: `Base's queries cast enum values to type "${change.from}", which no longer exists after the rename to "${change.to}".`,
        fix: `Keep the database name and rename the enum in Prisma only (@@map("${change.from}")).`,
      },
    ];
  },
};
