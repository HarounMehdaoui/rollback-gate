import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { main } from '../src/main.js';

const run = promisify(execFile);
const scenarios = fileURLToPath(new URL('../../../scenarios/', import.meta.url));
const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const created: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<void> {
  await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd });
}

/** A git repo whose tag `base` is the scenario's base and whose HEAD is its head. */
async function repoFrom(scenario: string, { commitHead = true } = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rollbackgate-'));
  created.push(dir);
  await git(dir, 'init', '-q', '-b', 'main');
  await cp(join(scenarios, scenario, 'base', 'prisma'), join(dir, 'prisma'), { recursive: true });
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', 'base');
  await git(dir, 'tag', 'base');
  await rm(join(dir, 'prisma'), { recursive: true });
  await cp(join(scenarios, scenario, 'head', 'prisma'), join(dir, 'prisma'), { recursive: true });
  if (commitHead) {
    await git(dir, 'add', '-A');
    await git(dir, 'commit', '-q', '-m', 'head');
  }
  return dir;
}

async function check(cwd: string, ...args: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await main(['check', ...args], {
    cwd,
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
  });
  return { code, stdout, stderr };
}

let unsafeRepo: string;
let riskyRepo: string;

beforeAll(async () => {
  [unsafeRepo, riskyRepo] = await Promise.all([
    repoFrom('drop-used-column'),
    repoFrom('widen-int-to-bigint'),
  ]);
});

afterAll(async () => {
  await Promise.all(created.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('rollbackgate check', () => {
  it('exits 1 on UNSAFE and prints each finding with where it comes from', async () => {
    const { code, stdout } = await check(unsafeRepo, '--base', 'base', '--head', 'HEAD');

    expect(code).toBe(1);
    expect(stdout).toContain('Rollback Gate: can HEAD be rolled back to base?');
    expect(stdout).toContain(
      'UNSAFE  RG-DB-002  "User"."name"  (20261102000000_drop_user_name, statement 1)',
    );
    expect(stdout).toMatch(/^ {8}Why: {2}Base selects every scalar column of model User/m);
    expect(stdout).toMatch(/^ {8}Fix: {2}Retire User\.name first/m);
    expect(stdout.trimEnd().split('\n').at(-1)).toBe('Verdict: UNSAFE (1 unsafe, 0 risky)');
  });

  it('exits 0 on RISKY', async () => {
    const { code, stdout } = await check(riskyRepo, '--base', 'base', '--head', 'HEAD');

    expect(code).toBe(0);
    expect(stdout).toContain('Verdict: RISKY (0 unsafe, 1 risky)');
  });

  it('exits 0 on SAFE', async () => {
    const { code, stdout } = await check(unsafeRepo, '--base', 'base', '--head', 'base');

    expect(code).toBe(0);
    expect(stdout).toContain('Verdict: SAFE (0 unsafe, 0 risky)');
  });

  it('prints JSON with --format json', async () => {
    const { code, stdout } = await check(
      unsafeRepo,
      '--base',
      'base',
      '--head',
      'HEAD',
      '--format',
      'json',
    );

    expect(code).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({
      base: 'base',
      head: 'HEAD',
      verdict: 'UNSAFE',
      counts: { unsafe: 1, risky: 0 },
      findings: [
        {
          ruleId: 'RG-DB-002',
          target: '"User"."name"',
          source: {
            kind: 'statement',
            migration: '20261102000000_drop_user_name',
            statementIndex: 0,
          },
        },
      ],
    });
  });

  it('reads head from the working tree with --head worktree', async () => {
    const dir = await repoFrom('drop-used-column', { commitHead: false });

    const { code, stdout } = await check(dir, '--base', 'base', '--head', 'worktree');

    expect(code).toBe(1);
    expect(stdout).toContain('Rollback Gate: can worktree be rolled back to base?');
  });

  describe('exits 2 on a tool error, never with a verdict', () => {
    it.each([
      [['--base', 'v9.9.9', '--head', 'HEAD'], '"v9.9.9" is not a commit'],
      [['--base=--upload-pack=x', '--head', 'HEAD'], '"--upload-pack=x" is not a commit'],
      [['--head', 'HEAD'], '--base is required'],
      [['--base', 'base'], '--head is required'],
      [['--base', 'base', '--head', 'HEAD', '--format', 'xml'], '--format must be text or json'],
      [['--base', 'base', '--head', 'HEAD', '--verbose'], 'Unknown option'],
    ])('for %j', async (args, message) => {
      const { code, stdout, stderr } = await check(unsafeRepo, ...args);

      expect(code).toBe(2);
      expect(stdout).toBe('');
      expect(stderr).toContain(message);
    });

    it('when base’s schema can’t be used', async () => {
      const dir = await repoFrom('drop-used-column');
      await writeFile(join(dir, 'prisma', 'schema.prisma'), 'model Broken {\n  id Strin @id\n}\n');
      await git(dir, 'commit', '-q', '-am', 'broken base');
      await git(dir, 'tag', 'broken');

      const { code, stderr } = await check(dir, '--base', 'broken', '--head', 'HEAD');

      expect(code).toBe(2);
      expect(stderr).toContain("base schema.prisma can't be used: invalid Prisma schema");
    });

    it('when the project has no prisma/schema.prisma', async () => {
      const { code, stderr } = await check(tmpdir(), '--base', 'HEAD', '--head', 'HEAD');

      expect(code).toBe(2);
      expect(stderr).toContain('rollbackgate: error:');
    });

    it('for an unknown command', async () => {
      let stderr = '';
      const code = await main(['deploy'], {
        cwd: unsafeRepo,
        stdout: () => undefined,
        stderr: (t) => (stderr += t),
      });

      expect(code).toBe(2);
      expect(stderr).toContain('unknown command "deploy"');
    });
  });

  it('runs as an executable and sets the process exit code', async () => {
    const result = await run('node', [bin, 'check', '--base', 'base', '--head', 'HEAD'], {
      cwd: unsafeRepo,
    }).catch((error: unknown) => error as { code: number; stdout: string });

    expect(result).toMatchObject({ code: 1 });
    expect(result.stdout).toContain('Verdict: UNSAFE');
  });
});
