import { computeVerdict, type Finding } from '@rollbackgate/core';
import { describe, expect, it } from 'vitest';

import { formatJson } from './format-json.js';
import { formatText } from './format-text.js';

const finding = (over: Partial<Finding>): Finding => ({
  ruleId: 'RG-DB-020',
  severity: 'UNSAFE',
  target: '1_init',
  reason: 'r',
  fix: 'f',
  source: { kind: 'migration', migration: '1_init' },
  ...over,
});

describe('formatText', () => {
  it('shows a whole-migration source by name and a release-wide source without a location', () => {
    const text = formatText(
      computeVerdict([
        finding({}),
        finding({
          ruleId: 'RG-RH-001',
          severity: 'UNSAFE',
          target: 'rehearsal',
          source: { kind: 'release' },
        }),
      ]),
      'v1',
      'v2',
    );

    expect(text).toContain('UNSAFE  RG-DB-020  1_init  (1_init)\n');
    expect(text).toContain('UNSAFE  RG-RH-001  rehearsal\n');
  });

  it('pads RISKY to the same width as UNSAFE', () => {
    expect(formatText(computeVerdict([finding({ severity: 'RISKY' })]), 'v1', 'v2')).toContain(
      'RISKY   RG-DB-020',
    );
  });

  it('prints only the verdict line when there are no findings', () => {
    expect(formatText(computeVerdict([]), 'v1', 'v2')).toBe(
      'Rollback Gate: can v2 be rolled back to v1?\n\nVerdict: SAFE (0 unsafe, 0 risky)\n',
    );
  });
});

describe('formatJson', () => {
  it('gives identical output for the same findings in any order', () => {
    const a = finding({});
    const b = finding({ ruleId: 'RG-DB-022', severity: 'RISKY', source: { kind: 'release' } });

    expect(formatJson(computeVerdict([a, b]), 'v1', 'v2')).toBe(
      formatJson(computeVerdict([b, a]), 'v1', 'v2'),
    );
  });
});
