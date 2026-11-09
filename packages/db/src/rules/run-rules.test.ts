import type { Change, FindingSource, Rule, RuleContext, SourcedChange } from '@rollbackgate/core';
import { describe, expect, it } from 'vitest';

import { dbRules } from './index.js';
import { runRules } from './run-rules.js';
import { baseSchema, contextFrom } from './test-used-set.js';

const emptyCtx: RuleContext = {
  usedSet: { tables: new Map(), enums: new Map(), uniqueIndexes: new Map() },
};
const at = (statementIndex: number): FindingSource => ({
  kind: 'statement',
  migration: '2_drop',
  statementIndex,
});
const sourced = (change: Change, statementIndex = 0): SourcedChange => ({
  change,
  source: at(statementIndex),
});

// Reports every change it receives, so the test can see what the engine passes it.
const recorder = (id: Rule['id'], appliesTo: Rule['appliesTo']): Rule => ({
  id,
  appliesTo,
  evaluate: (change) => [{ severity: 'RISKY', target: change.kind, reason: 'r', fix: 'f' }],
});

describe('runRules', () => {
  it('calls a rule only for the change kinds it declares', () => {
    const findings = runRules(
      [sourced({ kind: 'DropTable', table: 't' }), sourced({ kind: 'CreateTable', table: 't' }, 1)],
      emptyCtx,
      [recorder('RG-DB-901', ['DropTable'])],
    );

    expect(findings.map((f) => f.target)).toEqual(['DropTable']);
  });

  it('adds the rule ID and the change’s source to each hit', () => {
    const [finding] = runRules([sourced({ kind: 'DropTable', table: 't' }, 3)], emptyCtx, [
      recorder('RG-DB-901', ['DropTable']),
    ]);

    expect(finding).toEqual({
      ruleId: 'RG-DB-901',
      severity: 'RISKY',
      target: 'DropTable',
      reason: 'r',
      fix: 'f',
      source: at(3),
    });
  });

  it('runs every rule that applies to a change', () => {
    const findings = runRules([sourced({ kind: 'DropTable', table: 't' })], emptyCtx, [
      recorder('RG-DB-901', ['DropTable']),
      recorder('RG-DB-902', ['DropTable', 'DropColumn']),
    ]);

    expect(findings.map((f) => f.ruleId)).toEqual(['RG-DB-901', 'RG-DB-902']);
  });

  it('returns no findings when nothing applies', () => {
    expect(runRules([sourced({ kind: 'CreateTable', table: 't' })], emptyCtx, dbRules)).toEqual([]);
  });

  it('runs the real DB rules against a real base schema', () => {
    const findings = runRules(
      [
        sourced({ kind: 'DropColumn', table: 'users', column: 'full_name' }),
        sourced({ kind: 'DropColumn', table: 'users', column: 'legacy' }),
        sourced({ kind: 'DropTable', table: 'AuditLog' }, 1),
      ],
      contextFrom(baseSchema),
      dbRules,
    );

    expect(findings.map((f) => [f.ruleId, f.target])).toEqual([
      ['RG-DB-002', '"users"."full_name"'],
    ]);
  });
});

describe('dbRules', () => {
  it('has unique rule IDs', () => {
    const ids = dbRules.map((r) => r.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
