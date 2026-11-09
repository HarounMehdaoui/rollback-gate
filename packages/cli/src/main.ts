import { parseArgs } from 'node:util';

import { runCheck } from './commands/check.js';

export interface Io {
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const usage = `Usage: rollbackgate check --base <ref> --head <ref|worktree> [--format text|json]

Checks whether the head release can be rolled back to the base release.
Exit codes: 0 = SAFE or RISKY, 1 = UNSAFE, 2 = tool error.
`;

/** Thrown for bad arguments; printed with the usage, exit code 2. */
class UsageError extends Error {}

/**
 * The whole command line, testable without spawning a process: arguments in, exit code out. Any error
 * (bad arguments, bad ref, unusable base schema, a crash) is a tool error, exit code 2, so CI never
 * mistakes a tool failure for a verdict.
 */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  try {
    const [command, ...rest] = argv;
    if (command === undefined || command === '--help' || command === '-h') {
      io.stdout(usage);
      return command === undefined ? 2 : 0;
    }
    if (command !== 'check') throw new UsageError(`unknown command "${command}"`);
    return await runCheck(parseCheck(rest, io.cwd), io.stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(
      `rollbackgate: error: ${message}\n${error instanceof UsageError ? `\n${usage}` : ''}`,
    );
    return 2;
  }
}

function parseCheck(args: readonly string[], cwd: string) {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        base: { type: 'string' },
        head: { type: 'string' },
        format: { type: 'string', default: 'text' },
      },
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { base, head, format } = values;
  if (base === undefined) throw new UsageError('--base is required');
  if (head === undefined) throw new UsageError('--head is required');
  if (format !== 'text' && format !== 'json')
    throw new UsageError(`--format must be text or json, not "${format}"`);
  return { base, head, format, cwd } as const;
}
