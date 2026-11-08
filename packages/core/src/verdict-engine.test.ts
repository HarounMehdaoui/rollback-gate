import { describe, expect, it } from 'vitest';

import type { Finding, FindingSource } from './finding.js';
import type { RuleId } from './rule-id.js';
import type { FindingSeverity } from './severity.js';
import { computeVerdict } from './verdict-engine.js';

function finding(
  ruleId: RuleId,
  severity: FindingSeverity,
  source: FindingSource,
  target = '"User"."name"',
): Finding {
  return { ruleId, severity, target, reason: 'r', fix: 'f', source };
}

const statement = (migration: string, statementIndex: number): FindingSource => ({
  kind: 'statement',
  migration,
  statementIndex,
});
const wholeMigration = (migration: string): FindingSource => ({ kind: 'migration', migration });
const release: FindingSource = { kind: 'release' };

const ruleIdsOf = (findings: readonly Finding[]) => findings.map((f) => f.ruleId);

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

describe('computeVerdict: verdict and counts', () => {
  it('is SAFE with no findings', () => {
    expect(computeVerdict([])).toEqual({
      verdict: 'SAFE',
      findings: [],
      counts: { unsafe: 0, risky: 0 },
    });
  });

  it('is RISKY when every finding is RISKY', () => {
    const verdict = computeVerdict([
      finding('RG-DB-010', 'RISKY', statement('20261107_a', 0)),
      finding('RG-DB-018', 'RISKY', statement('20261107_a', 1)),
    ]);

    expect(verdict.verdict).toBe('RISKY');
    expect(verdict.counts).toEqual({ unsafe: 0, risky: 2 });
  });

  it('is UNSAFE as soon as one finding is UNSAFE', () => {
    const verdict = computeVerdict([
      finding('RG-DB-010', 'RISKY', statement('20261107_a', 0)),
      finding('RG-DB-002', 'UNSAFE', statement('20261107_a', 1)),
      finding('RG-DB-018', 'RISKY', statement('20261107_a', 2)),
    ]);

    expect(verdict.verdict).toBe('UNSAFE');
    expect(verdict.counts).toEqual({ unsafe: 1, risky: 2 });
  });
});

describe('computeVerdict: order', () => {
  it('puts UNSAFE before RISKY, whatever the input order', () => {
    const verdict = computeVerdict([
      finding('RG-DB-010', 'RISKY', statement('20261107_a', 0)),
      finding('RG-DB-002', 'UNSAFE', statement('20261108_b', 5)),
    ]);

    expect(ruleIdsOf(verdict.findings)).toEqual(['RG-DB-002', 'RG-DB-010']);
  });

  it('orders migrations by name, which is their apply order', () => {
    const verdict = computeVerdict([
      finding('RG-DB-001', 'UNSAFE', statement('20261108_later', 0)),
      finding('RG-DB-002', 'UNSAFE', statement('20261107_earlier', 3)),
    ]);

    expect(ruleIdsOf(verdict.findings)).toEqual(['RG-DB-002', 'RG-DB-001']);
  });

  it('orders statements by index as numbers (2 before 10)', () => {
    const verdict = computeVerdict([
      finding('RG-DB-001', 'UNSAFE', statement('20261107_a', 10)),
      finding('RG-DB-002', 'UNSAFE', statement('20261107_a', 2)),
    ]);

    expect(ruleIdsOf(verdict.findings)).toEqual(['RG-DB-002', 'RG-DB-001']);
  });

  it("puts a whole-migration finding before that migration's statements", () => {
    const verdict = computeVerdict([
      finding('RG-DB-002', 'UNSAFE', statement('20261107_a', 0)),
      finding('RG-DB-021', 'UNSAFE', wholeMigration('20261107_a')),
    ]);

    expect(ruleIdsOf(verdict.findings)).toEqual(['RG-DB-021', 'RG-DB-002']);
  });

  it('puts release-wide findings after all migration findings', () => {
    const verdict = computeVerdict([
      finding('RG-RH-001', 'UNSAFE', release),
      finding('RG-DB-002', 'UNSAFE', statement('20261199_last', 99)),
      finding('RG-DB-020', 'UNSAFE', wholeMigration('20261101_first')),
    ]);

    expect(ruleIdsOf(verdict.findings)).toEqual(['RG-DB-020', 'RG-DB-002', 'RG-RH-001']);
  });

  it('breaks ties on the same source by ruleId, then target', () => {
    const source = statement('20261107_a', 0);
    const verdict = computeVerdict([
      finding('RG-DB-012', 'RISKY', source, '"User"."email"'),
      finding('RG-DB-010', 'RISKY', source, '"User"."name"'),
      finding('RG-DB-010', 'RISKY', source, '"User"."email"'),
    ]);

    expect(verdict.findings.map((f) => `${f.ruleId} ${f.target}`)).toEqual([
      'RG-DB-010 "User"."email"',
      'RG-DB-010 "User"."name"',
      'RG-DB-012 "User"."email"',
    ]);
  });

  it('gives exactly the same output for every input order', () => {
    const findings = [
      finding('RG-RH-001', 'UNSAFE', release),
      finding('RG-DB-002', 'UNSAFE', statement('20261108_b', 0)),
      finding('RG-DB-021', 'UNSAFE', wholeMigration('20261107_a')),
      finding('RG-DB-018', 'RISKY', statement('20261107_a', 1)),
      finding('RG-DB-010', 'RISKY', statement('20261107_a', 1)),
    ];
    const expected = computeVerdict(findings);

    const results = permutations(findings).map(computeVerdict);

    expect(results).toHaveLength(120);
    for (const result of results) {
      expect(result).toEqual(expected);
    }
  });
});

describe('computeVerdict: purity and bad input', () => {
  it("doesn't modify the input array", () => {
    const input = Object.freeze([
      finding('RG-DB-010', 'RISKY', statement('20261107_a', 0)),
      finding('RG-DB-002', 'UNSAFE', statement('20261107_a', 1)),
    ]);

    const verdict = computeVerdict(input);

    expect(verdict.findings).not.toBe(input);
    expect(ruleIdsOf(input)).toEqual(['RG-DB-010', 'RG-DB-002']);
  });

  it('throws on a severity rules cannot report, instead of ignoring it', () => {
    const fromJson = JSON.parse(
      '{"ruleId":"RG-DB-002","severity":"SAFE","target":"t","reason":"r","fix":"f","source":{"kind":"release"}}',
    ) as Finding;

    expect(() => computeVerdict([fromJson])).toThrow('Unhandled case: "SAFE"');
  });

  it('keeps duplicates and counts them, so an upstream bug stays visible', () => {
    const duplicate = finding('RG-DB-002', 'UNSAFE', statement('20261107_a', 0));

    const verdict = computeVerdict([duplicate, duplicate]);

    expect(verdict.findings).toHaveLength(2);
    expect(verdict.counts).toEqual({ unsafe: 2, risky: 0 });
  });
});
