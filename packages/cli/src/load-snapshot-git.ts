import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { MigrationFile, Snapshot } from '@rollbackgate/core';

import { hashSql } from './hash-sql.js';

const run = promisify(execFile);

/** A ref that doesn't name a commit. A tool error (exit 2), not a finding. */
export class GitRefError extends Error {
  constructor(ref: string) {
    super(`"${ref}" is not a commit in this repository`);
    this.name = 'GitRefError';
  }
}

/**
 * Reads a release from git at `ref` (a tag, branch or commit), the same files the directory loader
 * reads: `prisma/schema.prisma` and every `prisma/migrations/<name>/migration.sql`, relative to `cwd`
 * inside the repository. Nothing is checked out; files are read with `git show`.
 */
export async function loadSnapshotFromGit(ref: string, cwd: string): Promise<Snapshot> {
  const commit = await resolveCommit(ref, cwd);
  const prefix = (await git(cwd, 'rev-parse', '--show-prefix')).trim();
  const prismaDir = `${prefix}prisma`;
  const prismaSchema = await readRequired(cwd, commit, `${prismaDir}/schema.prisma`);
  const names = await migrationFolders(cwd, commit, `${prismaDir}/migrations`);
  const migrations: MigrationFile[] = [];
  for (const name of names) {
    const sql = await readRequired(cwd, commit, `${prismaDir}/migrations/${name}/migration.sql`);
    migrations.push({ name, sql, sha256: hashSql(sql) });
  }
  return { ref, prismaSchema, migrations };
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  // execFile, not a shell: refs and paths are passed as arguments, never interpreted.
  const { stdout } = await run('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function resolveCommit(ref: string, cwd: string): Promise<string> {
  // A ref starting with "-" would be read as an option.
  if (ref.startsWith('-')) throw new GitRefError(ref);
  try {
    return (await git(cwd, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`)).trim();
  } catch {
    throw new GitRefError(ref);
  }
}

async function readRequired(cwd: string, commit: string, path: string): Promise<string> {
  try {
    return await git(cwd, 'show', `${commit}:${path}`);
  } catch (error) {
    throw new Error(`Required file not found at ${commit.slice(0, 12)}: ${path}`, { cause: error });
  }
}

// Folder names only, sorted like the directory loader (Prisma's apply order). No folder: none yet.
async function migrationFolders(cwd: string, commit: string, path: string): Promise<string[]> {
  let listing: string;
  try {
    listing = await git(cwd, 'ls-tree', '-d', '--name-only', `${commit}:${path}`);
  } catch {
    return [];
  }
  return listing
    .split('\n')
    .filter((name) => name !== '')
    .toSorted();
}
