import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-001 (RULES.md §4): a table base uses is dropped. UNSAFE: every base query on the model fails.
 * A table base doesn't know, or an `@@ignore` model, isn't in the used set, so it gives no finding.
 */
export const dropTableRule: Rule<'DropTable'> = {
  id: 'RG-DB-001',
  appliesTo: ['DropTable'],
  evaluate(change, { usedSet }) {
    const used = usedSet.tables.get(change.table);
    if (used === undefined) return [];
    return [
      {
        severity: 'UNSAFE',
        target: `"${change.table}"`,
        reason: `Every base query on model ${used.model} fails with "relation does not exist".`,
        fix: `Remove model ${used.model} from the code (or @@ignore it) in one release, and drop the table in the next one.`,
      },
    ];
  },
};
