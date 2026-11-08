import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listScenarios, parseExpected } from './scenario-files.js';

describe('listScenarios', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rollbackgate-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists scenario folders sorted, marks _ folders as fixtures, and skips files', async () => {
    for (const name of ['b-case', '_fixture', 'a-case']) {
      await mkdir(join(root, name));
    }
    await writeFile(join(root, 'README.md'), '# Scenarios');

    const scenarios = await listScenarios(root);

    expect(scenarios.map(({ name, isFixture }) => ({ name, isFixture }))).toEqual([
      { name: '_fixture', isFixture: true },
      { name: 'a-case', isFixture: false },
      { name: 'b-case', isFixture: false },
    ]);
  });
});

const unsafeFinding = { ruleId: 'RG-DB-002', severity: 'UNSAFE', target: '"User"."name"' };

describe('parseExpected', () => {
  it('accepts a SAFE result with no findings', () => {
    expect(parseExpected({ verdict: 'SAFE', findings: [] })).toEqual({
      verdict: 'SAFE',
      findings: [],
    });
  });

  it('accepts an UNSAFE result with its findings', () => {
    const expected = { verdict: 'UNSAFE', findings: [unsafeFinding] };

    expect(parseExpected(expected)).toEqual(expected);
  });

  it('rejects a verdict that does not match the findings', () => {
    expect(() => parseExpected({ verdict: 'SAFE', findings: [unsafeFinding] })).toThrow(
      '"verdict" is SAFE but the findings make it UNSAFE',
    );
  });

  it('rejects a SAFE finding', () => {
    const finding = { ...unsafeFinding, severity: 'SAFE' };

    expect(() => parseExpected({ verdict: 'SAFE', findings: [finding] })).toThrow(
      'findings[0].severity must be RISKY or UNSAFE',
    );
  });

  it('rejects a malformed rule ID', () => {
    const finding = { ...unsafeFinding, ruleId: 'RG-DB-02' };

    expect(() => parseExpected({ verdict: 'UNSAFE', findings: [finding] })).toThrow(
      'findings[0].ruleId must look like RG-DB-002',
    );
  });

  it('rejects a missing or misspelled key', () => {
    const missing = { ruleId: 'RG-DB-002', severity: 'UNSAFE' };
    const misspelled = { ruleId: 'RG-DB-002', severty: 'UNSAFE', target: 't' };

    expect(() => parseExpected({ verdict: 'UNSAFE', findings: [missing] })).toThrow(
      'findings[0] must have exactly these keys',
    );
    expect(() => parseExpected({ verdict: 'UNSAFE', findings: [misspelled] })).toThrow(
      'findings[0] must have exactly these keys',
    );
  });

  it('rejects something that is not an object', () => {
    expect(() => parseExpected([])).toThrow('expected.json must be an object');
  });
});
