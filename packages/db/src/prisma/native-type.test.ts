import { describe, expect, it } from 'vitest';

import { nativeTypeOf } from './native-type.js';
import type { ParsedField } from './parse-schema.js';

const field = (over: Partial<ParsedField>): ParsedField => ({
  name: 'f',
  dbName: 'f',
  kind: 'scalar',
  type: 'String',
  nativeType: null,
  isRequired: true,
  isList: false,
  ...over,
});
const noEnums = new Map<string, string>();

describe('nativeTypeOf', () => {
  it.each([
    ['String', 'text'],
    ['Int', 'int4'],
    ['BigInt', 'int8'],
    ['Float', 'float8'],
    ['Decimal', 'numeric(65,30)'],
    ['Boolean', 'bool'],
    ['DateTime', 'timestamp(3)'],
    ['Json', 'jsonb'],
    ['Bytes', 'bytea'],
  ])('gives a %s field without @db.* the type Prisma creates (%s)', (type, expected) => {
    expect(nativeTypeOf(field({ type }), noEnums)).toBe(expected);
  });

  it.each([
    ['VarChar', ['255'], 'varchar(255)'],
    ['Timestamptz', ['6'], 'timestamptz(6)'],
    ['Decimal', ['10', '2'], 'numeric(10,2)'],
    ['Uuid', [], 'uuid'],
    ['DoublePrecision', [], 'float8'],
    ['Char', ['3'], 'bpchar(3)'],
  ])('spells @db.%s(%s) as Postgres does', (name, args, expected) => {
    expect(nativeTypeOf(field({ nativeType: { name, args } }), noEnums)).toBe(expected);
  });

  it('uses the enum database name for an enum field', () => {
    const enums = new Map([['Role', 'user_role']]);

    expect(nativeTypeOf(field({ kind: 'enum', type: 'Role' }), enums)).toBe('user_role');
  });

  it('marks list columns as arrays', () => {
    expect(nativeTypeOf(field({ type: 'String', isList: true }), noEnums)).toBe('text[]');
  });

  it('returns null for a @db type it does not know, instead of guessing', () => {
    expect(nativeTypeOf(field({ nativeType: { name: 'Geometry', args: [] } }), noEnums)).toBeNull();
  });

  it('returns null for an enum it cannot resolve', () => {
    expect(nativeTypeOf(field({ kind: 'enum', type: 'Missing' }), noEnums)).toBeNull();
  });
});
