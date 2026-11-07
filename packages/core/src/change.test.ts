import { describe, expect, expectTypeOf, it } from 'vitest';

import { assertNever } from './assert-never.js';
import type { Change, ChangeKind, ChangeOfKind } from './change.js';

// Most of these checks happen at compile time: `pnpm test` runs `tsc -b` first.

const allKinds = [
  'CreateTable',
  'DropTable',
  'RenameTable',
  'AddColumn',
  'DropColumn',
  'RenameColumn',
  'AlterColumnType',
  'SetNotNull',
  'DropNotNull',
  'SetDefault',
  'DropDefault',
  'AddConstraint',
  'DropConstraint',
  'CreateIndex',
  'CreateUniqueIndex',
  'DropIndex',
  'RenameIndex',
  'CreateEnum',
  'AddEnumValue',
  'RemoveEnumValue',
  'RenameEnum',
  'DropEnum',
  'UpdateRows',
  'DeleteRows',
  'EditedMigration',
  'Unparsable',
  'Unrecognized',
] as const;

// Handles every kind, so `change` is `never` in `default`.
function describeTarget(change: Change): string {
  switch (change.kind) {
    case 'CreateTable':
    case 'DropTable':
    case 'AddConstraint':
    case 'DropConstraint':
    case 'CreateIndex':
    case 'CreateUniqueIndex':
    case 'UpdateRows':
    case 'DeleteRows':
      return change.table;
    case 'AddColumn':
    case 'DropColumn':
    case 'AlterColumnType':
    case 'SetNotNull':
    case 'DropNotNull':
    case 'SetDefault':
    case 'DropDefault':
      return `${change.table}.${change.column}`;
    case 'RenameTable':
    case 'RenameColumn':
    case 'RenameIndex':
    case 'RenameEnum':
      return `${change.from} -> ${change.to}`;
    case 'DropIndex':
      return change.name;
    case 'CreateEnum':
    case 'AddEnumValue':
    case 'RemoveEnumValue':
    case 'DropEnum':
      return change.enumName;
    case 'EditedMigration':
      return change.migration;
    case 'Unparsable':
    case 'Unrecognized':
      return change.sql;
    default:
      return assertNever(change);
  }
}

// Same switch, but `Unrecognized` is missing.
function describeTargetMissingOneKind(change: Change): string {
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- missing a case on purpose
  switch (change.kind) {
    case 'CreateTable':
    case 'DropTable':
    case 'AddConstraint':
    case 'DropConstraint':
    case 'CreateIndex':
    case 'CreateUniqueIndex':
    case 'UpdateRows':
    case 'DeleteRows':
      return change.table;
    case 'AddColumn':
    case 'DropColumn':
    case 'AlterColumnType':
    case 'SetNotNull':
    case 'DropNotNull':
    case 'SetDefault':
    case 'DropDefault':
      return `${change.table}.${change.column}`;
    case 'RenameTable':
    case 'RenameColumn':
    case 'RenameIndex':
    case 'RenameEnum':
      return `${change.from} -> ${change.to}`;
    case 'DropIndex':
      return change.name;
    case 'CreateEnum':
    case 'AddEnumValue':
    case 'RemoveEnumValue':
    case 'DropEnum':
      return change.enumName;
    case 'EditedMigration':
      return change.migration;
    case 'Unparsable':
      return change.sql;
    default:
      // @ts-expect-error -- `change` can still be Unrecognized here
      return assertNever(change);
  }
}

function columnOf(change: Change): string | undefined {
  if (change.kind === 'DropColumn') {
    return change.column;
  }
  if (change.kind === 'AddEnumValue') {
    // @ts-expect-error -- AddEnumValue has no `column`
    void change.column;
  }
  return undefined;
}

describe('Change (discriminated union)', () => {
  it('exposes the right fields after checking `kind`', () => {
    const dropColumn: Change = { kind: 'DropColumn', table: 'User', column: 'name' };
    const addValue: Change = { kind: 'AddEnumValue', enumName: 'Role', value: 'OWNER' };

    expect(columnOf(dropColumn)).toBe('name');
    expect(columnOf(addValue)).toBeUndefined();
  });

  it('accepts a switch that handles every kind and ends with assertNever', () => {
    const changes: Change[] = [
      { kind: 'DropTable', table: 'Session' },
      { kind: 'SetNotNull', table: 'User', column: 'email' },
      { kind: 'RenameColumn', table: 'User', from: 'name', to: 'fullName' },
      { kind: 'Unrecognized', sql: 'CREATE EXTENSION citext' },
    ];

    expect(changes.map(describeTarget)).toEqual([
      'Session',
      'User.email',
      'name -> fullName',
      'CREATE EXTENSION citext',
    ]);
  });

  it('fails to compile when a switch misses a kind', () => {
    // The real check is the @ts-expect-error in describeTargetMissingOneKind. Here we just see
    // what happens at runtime.
    const forgotten: Change = { kind: 'Unrecognized', sql: 'VACUUM' };

    expect(() => describeTargetMissingOneKind(forgotten)).toThrow('Unhandled case');
  });

  it('ChangeKind contains exactly the kinds of Change', () => {
    // Must match both ways, so a new kind can't be forgotten in the list.
    expectTypeOf<(typeof allKinds)[number]>().toEqualTypeOf<ChangeKind>();
    expect(new Set(allKinds).size).toBe(allKinds.length);
  });

  it('ChangeOfKind picks exactly one variant', () => {
    expectTypeOf<ChangeOfKind<'DropColumn'>>().toEqualTypeOf<{
      readonly kind: 'DropColumn';
      readonly table: string;
      readonly column: string;
    }>();
  });

  // Catches a shared variant like `kind: 'SetNotNull' | 'DropNotNull'`.
  it('every kind has its own variant', () => {
    type ImpreciseKinds = {
      [K in ChangeKind]: [ChangeOfKind<K>['kind']] extends [K] ? never : K;
    }[ChangeKind];

    expectTypeOf<ImpreciseKinds>().toBeNever();
  });
});
