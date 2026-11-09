import type { MigrationFile, Snapshot } from '@rollbackgate/core';
import { describe, expect, it } from 'vitest';

import { diffMigrations } from './diff-migrations.js';

const migration = (name: string, sha256 = `hash-${name}`): MigrationFile => ({
  name,
  sql: `-- ${name}`,
  sha256,
});
const snapshot = (...migrations: MigrationFile[]): Snapshot => ({
  ref: 'test',
  prismaSchema: '',
  migrations,
});

describe('diffMigrations', () => {
  it('reports nothing when head has the same migrations as base', () => {
    const base = snapshot(migration('1_init'), migration('2_add'));

    expect(diffMigrations(base, base)).toEqual({ newMigrations: [], changes: [] });
  });

  it('returns the migrations head adds, in head’s apply order', () => {
    const base = snapshot(migration('1_init'));
    const head = snapshot(migration('1_init'), migration('2_add'), migration('3_drop'));

    const { newMigrations, changes } = diffMigrations(base, head);

    expect(newMigrations.map((m) => m.name)).toEqual(['2_add', '3_drop']);
    expect(changes).toEqual([]);
  });

  // A branch merged late can add a migration that sorts before base's latest one; it's still new.
  it('treats a migration head adds between base’s migrations as new', () => {
    const base = snapshot(migration('1_init'), migration('3_later'));
    const head = snapshot(migration('1_init'), migration('2_late_merge'), migration('3_later'));

    expect(diffMigrations(base, head).newMigrations.map((m) => m.name)).toEqual(['2_late_merge']);
  });

  it('reports a base migration whose content changed as modified', () => {
    const base = snapshot(migration('1_init', 'aaa'));
    const head = snapshot(migration('1_init', 'bbb'));

    expect(diffMigrations(base, head)).toEqual({
      newMigrations: [],
      changes: [
        {
          change: { kind: 'EditedMigration', migration: '1_init', edit: 'modified' },
          source: { kind: 'migration', migration: '1_init' },
        },
      ],
    });
  });

  it('reports a base migration missing from head as removed', () => {
    const base = snapshot(migration('1_init'), migration('2_add'));
    const head = snapshot(migration('1_init'));

    expect(diffMigrations(base, head).changes).toEqual([
      {
        change: { kind: 'EditedMigration', migration: '2_add', edit: 'removed' },
        source: { kind: 'migration', migration: '2_add' },
      },
    ]);
  });

  it('reports edits in base’s order and new migrations at the same time', () => {
    const base = snapshot(migration('1_a'), migration('2_b'), migration('3_c'));
    const head = snapshot(migration('1_a', 'changed'), migration('3_c'), migration('4_d'));

    const { newMigrations, changes } = diffMigrations(base, head);

    expect(changes.map((c) => c.change)).toEqual([
      { kind: 'EditedMigration', migration: '1_a', edit: 'modified' },
      { kind: 'EditedMigration', migration: '2_b', edit: 'removed' },
    ]);
    expect(newMigrations.map((m) => m.name)).toEqual(['4_d']);
  });
});
