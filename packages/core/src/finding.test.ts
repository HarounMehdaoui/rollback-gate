import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Finding, FindingSource } from './finding.js';
import type { FindingSeverity } from './severity.js';

describe('FindingSeverity', () => {
  it('does not accept SAFE: rules say "safe" by returning no finding', () => {
    expectTypeOf<FindingSeverity>().toEqualTypeOf<'RISKY' | 'UNSAFE'>();
    expectTypeOf<'SAFE'>().not.toExtend<FindingSeverity>();
  });
});

describe('Finding', () => {
  it('can come from a statement, a whole migration or the release', () => {
    const base = { severity: 'UNSAFE', target: '"User"."name"', reason: 'r', fix: 'f' } as const;
    const findings: Finding[] = [
      {
        ...base,
        ruleId: 'RG-DB-002',
        source: { kind: 'statement', migration: '20261107_drop_name', statementIndex: 0 },
      },
      { ...base, ruleId: 'RG-DB-020', source: { kind: 'migration', migration: '20261101_init' } },
      { ...base, ruleId: 'RG-RH-001', source: { kind: 'release' } },
    ];

    expect(findings.map((finding) => finding.source.kind)).toEqual([
      'statement',
      'migration',
      'release',
    ]);
  });

  it('requires a statement index for a statement source', () => {
    expectTypeOf<{ kind: 'statement'; migration: string }>().not.toExtend<FindingSource>();
  });

  // added: a release-level finding (config, rehearsal) has no migration to point at. TypeScript is
  // structural, so only a fresh object literal gets this check ("excess property check").
  it('rejects a migration name written on a release source', () => {
    const sources: FindingSource[] = [
      // @ts-expect-error -- `migration` doesn't exist on a release source
      { kind: 'release', migration: '20261107_drop_name' },
    ];

    expect(sources).toHaveLength(1);
  });
});
