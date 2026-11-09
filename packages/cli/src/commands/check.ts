import type { Snapshot } from '@rollbackgate/core';
import { computeVerdict } from '@rollbackgate/core';
import { analyzeDb, initSqlParser } from '@rollbackgate/db';

import { formatJson } from '../format-json.js';
import { formatText } from '../format-text.js';
import { loadSnapshotFromDir } from '../load-snapshot-dir.js';
import { loadSnapshotFromGit } from '../load-snapshot-git.js';

export interface CheckOptions {
  /** The release to roll back to: a git ref. */
  readonly base: string;
  /** The candidate release: a git ref, or `worktree` for the files on disk. */
  readonly head: string;
  readonly format: 'text' | 'json';
  /** Where the project is: `prisma/` is read relative to it. */
  readonly cwd: string;
}

/** Exit codes are the CI contract: 0 = SAFE or RISKY, 1 = UNSAFE (2 = tool error, set by main). */
export async function runCheck(
  options: CheckOptions,
  write: (text: string) => void,
): Promise<number> {
  await initSqlParser();
  const [base, head] = await Promise.all([
    loadSnapshotFromGit(options.base, options.cwd),
    loadHead(options.head, options.cwd),
  ]);
  const verdict = computeVerdict(analyzeDb(base, head));
  const format = options.format === 'json' ? formatJson : formatText;
  write(format(verdict, base.ref, head.ref));
  return verdict.verdict === 'UNSAFE' ? 1 : 0;
}

function loadHead(head: string, cwd: string): Promise<Snapshot> {
  return head === 'worktree'
    ? loadSnapshotFromDir(cwd, 'worktree')
    : loadSnapshotFromGit(head, cwd);
}
