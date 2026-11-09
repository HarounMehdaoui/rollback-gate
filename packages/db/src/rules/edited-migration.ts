import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-020 (RULES.md §4): a migration base already applied was edited or removed in head. UNSAFE:
 * environments that ran the old version no longer match head's history, so neither schema can be
 * trusted to describe the database.
 */
export const editedMigrationRule: Rule<'EditedMigration'> = {
  id: 'RG-DB-020',
  appliesTo: ['EditedMigration'],
  evaluate(change) {
    return [
      {
        severity: 'UNSAFE',
        target: change.migration,
        reason: `Migration ${change.migration} was already applied and is ${change.edit} in this release, so environments that ran the old version no longer match the migration history; neither base's nor head's schema can be trusted to match the database.`,
        fix: 'Never edit or delete an applied migration: restore it and add a new migration instead.',
      },
    ];
  },
};
