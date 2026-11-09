import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-021 (RULES.md §4): Postgres's parser rejects the migration. UNSAFE, fail-closed: the tool
 * can't tell what the migration does to base, so it never assumes it's harmless.
 */
export const unparsableSqlRule: Rule<'Unparsable'> = {
  id: 'RG-DB-021',
  appliesTo: ['Unparsable'],
  evaluate(change) {
    return [
      {
        severity: 'UNSAFE',
        target: 'migration.sql',
        reason: `Rollback Gate can't tell what this migration does to base: Postgres's parser rejects it (${change.error}).`,
        fix: "Fix the SQL so Postgres's own parser accepts it.",
      },
    ];
  },
};
