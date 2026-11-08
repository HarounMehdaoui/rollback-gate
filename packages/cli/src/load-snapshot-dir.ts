import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MigrationFile, Snapshot } from '@rollbackgate/core';

/**
 * Reads one release folder (`prisma/schema.prisma` and `prisma/migrations/*\/migration.sql`) into a
 * Snapshot. A missing `migrations/` folder just means no migrations yet.
 *
 * @param ref What the snapshot came from, for messages. Defaults to the folder path.
 * @throws Error if `schema.prisma` is missing, or a migration folder has no `migration.sql`.
 */
export async function loadSnapshotFromDir(dir: string, ref: string = dir): Promise<Snapshot> {
  const prismaDir = join(dir, 'prisma');
  const prismaSchema = await readRequired(join(prismaDir, 'schema.prisma'));
  const migrations = await loadMigrations(join(prismaDir, 'migrations'));

  return { ref, prismaSchema, migrations };
}

async function loadMigrations(migrationsDir: string): Promise<MigrationFile[]> {
  const names = await listMigrationFolders(migrationsDir);

  return Promise.all(
    names.map(async (name) => {
      const sql = await readRequired(join(migrationsDir, name, 'migration.sql'));
      return { name, sql, sha256: hashSql(sql) };
    }),
  );
}

async function listMigrationFolders(migrationsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(migrationsDir, { withFileTypes: true });
    // Only folders: Prisma also keeps migration_lock.toml in there. Default sort is by code
    // unit, which is Prisma's apply order since names start with a timestamp.
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
}

async function readRequired(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(`Required file not found: ${path}`, { cause: error });
    }
    throw error;
  }
}

// CRLF → LF first, so a Windows checkout doesn't look like an edited migration (RG-DB-020).
function hashSql(sql: string): string {
  return createHash('sha256').update(sql.replaceAll('\r\n', '\n'), 'utf8').digest('hex');
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
