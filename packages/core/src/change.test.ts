import { describe, expect, expectTypeOf, it } from 'vitest';

import { assertNever } from './assert-never.js';
import type { Change, ChangeKind, ChangeOfKind } from './change.js';

// Most checks here are compile-time: `pnpm test` runs `tsc -b` first, so a type assertion or an
// unused `@ts-expect-error` that stops holding fails the run (TASKS.md T1.01, decision D7).

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

/** Handles every kind. Compiles only because `change` is `never` by the time it reaches `default`. */
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

/** The same switch with `Unrecognized` forgotten: the `assertNever` call must not compile. */
function describeTargetMissingOneKind(change: Change): string {
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- incomplete on purpose: it's what this test proves
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
      // @ts-expect-error -- `Unrecognized` isn't handled, so `change` isn't `never` here
      return assertNever(change);
  }
}

function columnOf(change: Change): string | undefined {
  if (change.kind === 'DropColumn') {
    return change.column;
  }
  if (change.kind === 'AddEnumValue') {
    // @ts-expect-error -- AddEnumValue has no `column`: the compiler knows which fields each kind has
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
    // The proof is the `@ts-expect-error` inside describeTargetMissingOneKind: if that switch ever
    // became exhaustive, the directive would be unused and `tsc -b` would fail. At runtime the
    // forgotten kind falls through to assertNever and throws.
    const forgotten: Change = { kind: 'Unrecognized', sql: 'VACUUM' };

    expect(() => describeTargetMissingOneKind(forgotten)).toThrow('Unhandled case');
  });

  it('ChangeKind contains exactly the kinds of Change', () => {
    // Equal in both directions: a kind added to Change but not to allKinds fails, and vice versa.
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

  // added: a variant shared by several kinds (`kind: 'SetNotNull' | 'DropNotNull'`) would hand a
  // SetNotNull rule a change whose kind could be DropNotNull. This catches it for every kind at once.
  it('every kind has its own variant', () => {
    type ImpreciseKinds = {
      [K in ChangeKind]: [ChangeOfKind<K>['kind']] extends [K] ? never : K;
    }[ChangeKind];

    expectTypeOf<ImpreciseKinds>().toBeNever();
  });
});
