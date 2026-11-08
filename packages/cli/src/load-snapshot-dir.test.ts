import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadSnapshotFromDir } from './load-snapshot-dir.js';

const smokeBase = fileURLToPath(new URL('../../../scenarios/_smoke/base', import.meta.url));
const schema = 'model User {\n  id Int @id\n}\n';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rollbackgate-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Writes files (path relative to the release folder → content) and returns the folder. */
async function writeRelease(name: string, files: Record<string, string>): Promise<string> {
  const dir = join(root, name);
  for (const [relative, content] of Object.entries(files)) {
    const path = join(dir, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return dir;
}

describe('loadSnapshotFromDir', () => {
  it('loads the _smoke base release', async () => {
    const snapshot = await loadSnapshotFromDir(smokeBase);

    expect(snapshot.prismaSchema).toBe(
      await readFile(join(smokeBase, 'prisma/schema.prisma'), 'utf8'),
    );
    expect(snapshot.migrations.map((m) => m.name)).toEqual(['20261101000000_init']);
    expect(snapshot.migrations[0]?.sql).toContain('CREATE TABLE "User"');
    expect(snapshot.migrations[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sorts migrations by name, which is their apply order', async () => {
    const dir = await writeRelease('release', {
      'prisma/schema.prisma': schema,
      'prisma/migrations/20261103000000_c/migration.sql': 'SELECT 3;',
      'prisma/migrations/20261101000000_a/migration.sql': 'SELECT 1;',
      'prisma/migrations/20261102000000_b/migration.sql': 'SELECT 2;',
    });

    const snapshot = await loadSnapshotFromDir(dir);

    expect(snapshot.migrations.map((m) => m.name)).toEqual([
      '20261101000000_a',
      '20261102000000_b',
      '20261103000000_c',
    ]);
  });

  it('ignores files next to the migration folders, like migration_lock.toml', async () => {
    const dir = await writeRelease('release', {
      'prisma/schema.prisma': schema,
      'prisma/migrations/migration_lock.toml': 'provider = "postgresql"\n',
      'prisma/migrations/notes.md': 'not a migration',
      'prisma/migrations/20261101000000_a/migration.sql': 'SELECT 1;',
    });

    const snapshot = await loadSnapshotFromDir(dir);

    expect(snapshot.migrations.map((m) => m.name)).toEqual(['20261101000000_a']);
  });

  it('returns no migrations when the migrations folder does not exist yet', async () => {
    const dir = await writeRelease('release', { 'prisma/schema.prisma': schema });

    const snapshot = await loadSnapshotFromDir(dir);

    expect(snapshot.migrations).toEqual([]);
  });

  it('fails when schema.prisma is missing', async () => {
    const dir = await writeRelease('release', {
      'prisma/migrations/20261101000000_a/migration.sql': 'SELECT 1;',
    });

    await expect(loadSnapshotFromDir(dir)).rejects.toThrow(
      /Required file not found: .*prisma[/\\]schema\.prisma/,
    );
  });

  it('fails when a migration folder has no migration.sql, instead of skipping it', async () => {
    const dir = await writeRelease('release', {
      'prisma/schema.prisma': schema,
      'prisma/migrations/20261101000000_a/migration.sql': 'SELECT 1;',
      'prisma/migrations/20261102000000_broken/README.md': 'oops',
    });

    await expect(loadSnapshotFromDir(dir)).rejects.toThrow(
      /Required file not found: .*20261102000000_broken[/\\]migration\.sql/,
    );
  });

  it('gives the same hash for CRLF and LF line endings', async () => {
    const lf = await writeRelease('lf', {
      'prisma/schema.prisma': schema,
      'prisma/migrations/20261101000000_a/migration.sql': 'SELECT 1;\nSELECT 2;\n',
    });
    const crlf = await writeRelease('crlf', {
      'prisma/schema.prisma': schema,
      'prisma/migrations/20261101000000_a/migration.sql': 'SELECT 1;\r\nSELECT 2;\r\n',
    });

    const [fromLf, fromCrlf] = await Promise.all([
      loadSnapshotFromDir(lf),
      loadSnapshotFromDir(crlf),
    ]);

    expect(fromCrlf.migrations[0]?.sha256).toBe(fromLf.migrations[0]?.sha256);
    expect(fromCrlf.migrations[0]?.sql).toBe('SELECT 1;\r\nSELECT 2;\r\n');
  });

  it('computes the standard sha256 (checked on an empty file)', async () => {
    const dir = await writeRelease('release', {
      'prisma/schema.prisma': schema,
      'prisma/migrations/20261101000000_empty/migration.sql': '',
    });

    const snapshot = await loadSnapshotFromDir(dir);

    expect(snapshot.migrations[0]?.sha256).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('uses the folder path as ref unless one is given', async () => {
    const dir = await writeRelease('release', { 'prisma/schema.prisma': schema });

    expect((await loadSnapshotFromDir(dir)).ref).toBe(dir);
    expect((await loadSnapshotFromDir(dir, 'v1.4.0')).ref).toBe('v1.4.0');
  });
});
