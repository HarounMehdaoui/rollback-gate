import type { Change, RuleContext } from '@rollbackgate/core';
import { describe, expect, it } from 'vitest';

import { runRules } from './run-rules.js';
import { contextFrom } from './test-used-set.js';
import { typeNarrowingRule } from './type-narrowing.js';
import { typeWideningRule } from './type-widening.js';
import { unknownTypeChangeRule } from './unknown-type-change.js';

const ctx = contextFrom(`
model Item {
  id      Int      @id
  title   String   @db.VarChar(50)
  count   Int
  small   Int      @db.SmallInt
  price   Decimal  @db.Decimal(10, 2)
  at      DateTime
  legacy  String?  @ignore
}
`);
const typeRules = [typeNarrowingRule, typeWideningRule, unknownTypeChangeRule];

function findingsFor(column: string, toType: string, hasUsing = false, context: RuleContext = ctx) {
  const change: Change = { kind: 'AlterColumnType', table: 'Item', column, toType, hasUsing };
  const source = { kind: 'statement', migration: '2', statementIndex: 0 } as const;
  return runRules([{ change, source }], context, typeRules).map((f) => [f.ruleId, f.severity]);
}

describe('type rules', () => {
  it.each([
    ['title', 'text'],
    ['title', 'varchar(255)'],
    ['small', 'int4'],
    ['price', 'numeric(12,2)'],
    ['title', 'varchar(50)'],
  ])('emit no finding when %s widens to %s within its Prisma scalar', (column, toType) => {
    expect(findingsFor(column, toType)).toEqual([]);
  });

  it.each([
    ['title', 'varchar(20)'],
    ['count', 'int2'],
    ['price', 'numeric(8,2)'],
  ])('flag %s narrowed to %s as RG-DB-006, RISKY', (column, toType) => {
    expect(findingsFor(column, toType)).toEqual([['RG-DB-006', 'RISKY']]);
  });

  it.each([
    ['count', 'int8'],
    ['at', 'timestamp(6)'],
  ])('flag %s widened to %s beyond its Prisma scalar as RG-DB-007, RISKY', (column, toType) => {
    expect(findingsFor(column, toType)).toEqual([['RG-DB-007', 'RISKY']]);
  });

  describe('fail closed (RG-DB-008, UNSAFE)', () => {
    it('flags an unknown pair of types', () => {
      expect(findingsFor('title', 'int4')).toEqual([['RG-DB-008', 'UNSAFE']]);
    });

    it('flags a change with a USING cast, even a known widening', () => {
      expect(findingsFor('count', 'int8', true)).toEqual([['RG-DB-008', 'UNSAFE']]);
    });

    it('flags a change when base’s type couldn’t be resolved', () => {
      const unresolved: RuleContext = {
        usedSet: {
          ...ctx.usedSet,
          tables: new Map([
            [
              'Item',
              {
                model: 'Item',
                columns: new Map([
                  [
                    'shape',
                    {
                      field: 'shape',
                      prismaType: 'String',
                      nativeType: null,
                      isOptional: false,
                      isList: false,
                    },
                  ],
                ]),
              },
            ],
          ]),
        },
      };

      const [finding] = unknownTypeChangeRule.evaluate(
        {
          kind: 'AlterColumnType',
          table: 'Item',
          column: 'shape',
          toType: 'text',
          hasUsing: false,
        },
        unresolved,
      );

      expect(finding).toMatchObject({ severity: 'UNSAFE', target: '"Item"."shape"' });
      expect(finding?.reason).toContain("couldn't be resolved");
    });
  });

  it.each(['legacy', 'unknown'])('emit no finding for %s, which base does not use', (column) => {
    expect(findingsFor(column, 'int4')).toEqual([]);
  });
});
