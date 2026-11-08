import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadSnapshotFromDir } from '../src/load-snapshot-dir.js';
import { listScenarios, readExpected } from './scenario-files.js';

// One end-to-end test per folder in scenarios/. Adding a scenario means adding files, not code.
const scenariosRoot = fileURLToPath(new URL('../../../scenarios/', import.meta.url));
const scenarios = await listScenarios(scenariosRoot);

describe('scenario runner', () => {
  it('finds the _smoke fixture', () => {
    expect(scenarios).toContainEqual(expect.objectContaining({ name: '_smoke', isFixture: true }));
  });
});

describe.each(scenarios)('scenario $name', ({ path, isFixture }) => {
  it('has a valid expected.json', async () => {
    await expect(readExpected(path)).resolves.toBeDefined();
  });

  it('loads base and head', async () => {
    const [base, head] = await Promise.all([
      loadSnapshotFromDir(join(path, 'base')),
      loadSnapshotFromDir(join(path, 'head')),
    ]);

    expect(base.prismaSchema).not.toBe('');
    expect(head.prismaSchema).not.toBe('');
  });

  if (!isFixture) {
    it.todo('matches expected.json (needs analyzeDb, T1.11)');
  }
});
