import type { MigrationFile, Snapshot, SourcedChange } from '@rollbackgate/core';

export interface MigrationDiff {
  /** In head but not in base, in head's apply order: the ones this release will run. */
  readonly newMigrations: readonly MigrationFile[];
  /** Base migrations that head edited or removed, in base's order (RG-DB-020). */
  readonly changes: readonly SourcedChange[];
}

/**
 * Compares base's and head's migration history by folder name and content hash. Only new migrations
 * are parsed and checked statement by statement; an already-applied migration that head edited or
 * removed is a change of its own, because the database won't run it again and head's schema history
 * no longer matches what is deployed.
 */
export function diffMigrations(base: Snapshot, head: Snapshot): MigrationDiff {
  const headByName = new Map(head.migrations.map((m) => [m.name, m]));
  const baseNames = new Set(base.migrations.map((m) => m.name));

  const changes = base.migrations.flatMap((applied): SourcedChange[] => {
    const current = headByName.get(applied.name);
    if (current !== undefined && current.sha256 === applied.sha256) return [];
    return [
      {
        change: {
          kind: 'EditedMigration',
          migration: applied.name,
          edit: current === undefined ? 'removed' : 'modified',
        },
        source: { kind: 'migration', migration: applied.name },
      },
    ];
  });

  return {
    newMigrations: head.migrations.filter((m) => !baseNames.has(m.name)),
    changes,
  };
}
