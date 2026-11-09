import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-003 (RULES.md §4): a table base uses is renamed. UNSAFE: base queries the old name. Prisma
 * itself renames a model with DROP + CREATE (RG-DB-001); this catches hand-written renames.
 */
export const renameTableRule: Rule<'RenameTable'> = {
  id: 'RG-DB-003',
  appliesTo: ['RenameTable'],
  evaluate(change, { usedSet }) {
    const used = usedSet.tables.get(change.from);
    if (used === undefined) return [];
    return [
      {
        severity: 'UNSAFE',
        target: `"${change.from}"`,
        reason: `Base queries model ${used.model} as table "${change.from}", which no longer exists after the rename to "${change.to}".`,
        fix: `Keep the table name and rename only the model (@@map("${change.from}")), or move to the new table over several releases (expand/contract).`,
      },
    ];
  },
};
