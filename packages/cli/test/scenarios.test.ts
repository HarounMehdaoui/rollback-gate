import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { computeVerdict } from '@rollbackgate/core';
import { analyzeDb, initSqlParser } from '@rollbackgate/db';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadSnapshotFromDir } from '../src/load-snapshot-dir.js';
import { listScenarios, readExpected } from './scenario-files.js';

// One end-to-end test per folder in scenarios/. Adding a scenario means adding files, not code.
const scenariosRoot = fileURLToPath(new URL('../../../scenarios/', import.meta.url));
const scenarios = await listScenarios(scenariosRoot);

beforeAll(async () => {
  await initSqlParser();
});

describe('scenario runner', () => {
  it('finds the _smoke fixture', () => {
    expect(scenarios).toContainEqual(expect.objectContaining({ name: '_smoke', isFixture: true }));
  });
});

describe.each(scenarios)('scenario $name', ({ path }) => {
  it('has a valid expected.json', async () => {
    await expect(readExpected(path)).resolves.toBeDefined();
  });

  // Only the fields in expected.json are compared, so reason and fix wording can change freely.
  it('gives the expected verdict and findings', async () => {
    const [base, head, expected] = await Promise.all([
      loadSnapshotFromDir(join(path, 'base')),
      loadSnapshotFromDir(join(path, 'head')),
      readExpected(path),
    ]);

    const { verdict, findings } = computeVerdict(analyzeDb(base, head));

    expect({
      verdict,
      findings: findings.map(({ ruleId, severity, target }) => ({ ruleId, severity, target })),
    }).toEqual(expected);
  });
});
