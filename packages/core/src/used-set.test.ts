import { describe, expect, expectTypeOf, it } from 'vitest';

import type { UsedColumn, UsedSet, UsedTable } from './used-set.js';

describe('UsedColumn', () => {
  it('can describe a column with no default and an unresolved native type', () => {
    const column: UsedColumn = {
      field: 'legacyCode',
      prismaType: 'Unsupported("ltree")',
      nativeType: null,
      isOptional: true,
      isList: false,
    };

    expect(column.nativeType).toBeNull();
    expect(column.default).toBeUndefined();
  });

  it('forces producers to state the native type, even when it is unknown', () => {
    expectTypeOf<{
      field: string;
      prismaType: string;
      isOptional: boolean;
      isList: boolean;
    }>().not.toExtend<UsedColumn>();
  });

  // "No default" means the key is missing. One way to say it, one way to check it.
  it('rejects `default: undefined`; a missing default is an absent key', () => {
    expectTypeOf<{
      field: string;
      prismaType: string;
      nativeType: string;
      isOptional: boolean;
      isList: boolean;
      default: undefined;
    }>().not.toExtend<UsedColumn>();
  });
});

describe('UsedSet', () => {
  it('makes lookups return `undefined` for tables base does not use', () => {
    const usedSet: UsedSet = { tables: new Map(), enums: new Map() };

    expectTypeOf(usedSet.tables.get('User')).toEqualTypeOf<UsedTable | undefined>();
    expect(usedSet.tables.get('User')).toBeUndefined();
  });

  it('cannot be modified by a rule', () => {
    expectTypeOf<UsedSet['tables']>().not.toHaveProperty('set');
    expectTypeOf<UsedTable['columns']>().not.toHaveProperty('delete');
  });
});
