import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Change, ChangeOfKind } from './change.js';
import type { Rule, RuleContext, RuleHit } from './rule.js';
import type { RuleId } from './rule-id.js';
import type { UsedTable } from './used-set.js';

// A fake rule for testing the type. The real RG-DB-002 comes in T1.10.
const sampleDropColumnRule: Rule<'DropColumn'> = {
  id: 'RG-DB-999',
  appliesTo: ['DropColumn'],
  evaluate(change, ctx) {
    const isUsed = ctx.usedSet.tables.get(change.table)?.columns.has(change.column) ?? false;
    if (!isUsed) {
      return [];
    }
    return [
      { severity: 'UNSAFE', target: `"${change.table}"."${change.column}"`, reason: 'r', fix: 'f' },
    ];
  },
};

const userTable: UsedTable = {
  model: 'User',
  columns: new Map([
    [
      'name',
      { field: 'name', prismaType: 'String', nativeType: 'text', isOptional: false, isList: false },
    ],
  ]),
};
const ctx: RuleContext = { usedSet: { tables: new Map([['User', userTable]]), enums: new Map() } };

describe('Rule', () => {
  it('receives the change already narrowed to the kinds in appliesTo', () => {
    expectTypeOf<Parameters<Rule<'DropColumn'>['evaluate']>[0]>().toEqualTypeOf<
      ChangeOfKind<'DropColumn'>
    >();
  });

  it('returns no hit for a change that does not hurt base, and a hit otherwise', () => {
    const unused = sampleDropColumnRule.evaluate(
      { kind: 'DropColumn', table: 'User', column: 'nickname' },
      ctx,
    );
    const used = sampleDropColumnRule.evaluate(
      { kind: 'DropColumn', table: 'User', column: 'name' },
      ctx,
    );

    expect(unused).toEqual([]);
    expect(used).toEqual([{ severity: 'UNSAFE', target: '"User"."name"', reason: 'r', fix: 'f' }]);
  });

  it('fits in a list of rules of different kinds', () => {
    const rules: readonly Rule[] = [sampleDropColumnRule];

    // From the list, a rule seems to accept any Change. The engine has to check appliesTo.
    expectTypeOf<Parameters<(typeof rules)[number]['evaluate']>[0]>().toEqualTypeOf<Change>();
    expect(rules).toHaveLength(1);
  });
});

describe('RuleHit', () => {
  it('has no ruleId or source: the engine adds them', () => {
    expectTypeOf<RuleHit>().not.toHaveProperty('ruleId');
    expectTypeOf<RuleHit>().not.toHaveProperty('source');
  });
});

describe('RuleId', () => {
  it('accepts RG-<AREA>-<NNN> with a known area and exactly three digits', () => {
    expectTypeOf<'RG-DB-002'>().toExtend<RuleId>();
    expectTypeOf<'RG-CFG-001'>().toExtend<RuleId>();
    expectTypeOf<'RG-RH-001'>().toExtend<RuleId>();
  });

  it('rejects malformed IDs', () => {
    expectTypeOf<'RG-DB-02'>().not.toExtend<RuleId>();
    expectTypeOf<'RG-DB-0002'>().not.toExtend<RuleId>();
    expectTypeOf<'DB-002'>().not.toExtend<RuleId>();
    expectTypeOf<'RG-XYZ-001'>().not.toExtend<RuleId>();
  });
});
