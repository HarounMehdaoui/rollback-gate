import type { ParsedField } from './parse-schema.js';

// Spelled the way Postgres's parser (libpg-query) reports `ALTER COLUMN … TYPE`, so the type rules
// (T1.16) can compare base's type with the migration's without a second translation.

/** What Prisma creates for a scalar without `@db.*` (RULES.md §6 row 2). */
const defaultNativeType: Readonly<Record<string, string>> = {
  String: 'text',
  Int: 'int4',
  BigInt: 'int8',
  Float: 'float8',
  Decimal: 'numeric(65,30)',
  Boolean: 'bool',
  DateTime: 'timestamp(3)',
  Json: 'jsonb',
  Bytes: 'bytea',
};

/** Prisma's `@db.*` names for PostgreSQL → Postgres's own type names. */
const postgresName: Readonly<Record<string, string>> = {
  Text: 'text',
  Char: 'bpchar',
  VarChar: 'varchar',
  Bit: 'bit',
  VarBit: 'varbit',
  Uuid: 'uuid',
  Xml: 'xml',
  Inet: 'inet',
  Citext: 'citext',
  Boolean: 'bool',
  Integer: 'int4',
  SmallInt: 'int2',
  BigInt: 'int8',
  Oid: 'oid',
  DoublePrecision: 'float8',
  Real: 'float4',
  Decimal: 'numeric',
  Money: 'money',
  Timestamp: 'timestamp',
  Timestamptz: 'timestamptz',
  Date: 'date',
  Time: 'time',
  Timetz: 'timetz',
  Json: 'json',
  JsonB: 'jsonb',
  ByteA: 'bytea',
};

/**
 * The Postgres type of a column: the enum's database name for enum fields, the `@db.*` type, or the
 * scalar's default. `null` when it can't be told, which RG-DB-008 treats as UNSAFE (fail-closed):
 * guessing would look exactly like a fact.
 */
export function nativeTypeOf(
  field: ParsedField,
  enumDbNames: ReadonlyMap<string, string>,
): string | null {
  const base = baseType(field, enumDbNames);
  if (base === null) return null;
  return field.isList ? `${base}[]` : base;
}

function baseType(field: ParsedField, enumDbNames: ReadonlyMap<string, string>): string | null {
  if (field.kind === 'enum') return enumDbNames.get(field.type) ?? null;
  if (field.nativeType === null) return defaultNativeType[field.type] ?? null;
  const name = postgresName[field.nativeType.name];
  if (name === undefined) return null;
  return field.nativeType.args.length === 0 ? name : `${name}(${field.nativeType.args.join(',')})`;
}
