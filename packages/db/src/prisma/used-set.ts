import type { UsedColumn, UsedEnum, UsedSet, UsedTable, UsedUniqueIndex } from '@rollbackgate/core';

import { defaultIndexName } from './default-index-name.js';
import { nativeTypeOf } from './native-type.js';
import {
  parsePrismaSchema,
  type ParsedDefault,
  type ParsedField,
  type ParsedModel,
  type ParsedSchema,
} from './parse-schema.js';

export type UsedSetResult =
  { readonly ok: true; readonly usedSet: UsedSet } | { readonly ok: false; readonly error: string };

/**
 * Builds what base's code can touch from base's `schema.prisma` (RULES.md §2): tables, columns and
 * enums by database name, minus `@ignore`/`@@ignore` (Prisma leaves those out), plus base's unique
 * indexes by name for RG-DB-023. A schema that can't be read is an error, never an empty used set.
 */
export function buildUsedSet(schemaText: string): UsedSetResult {
  const parsed = parsePrismaSchema(schemaText);
  if (!parsed.ok) return parsed;
  return { ok: true, usedSet: toUsedSet(parsed.schema) };
}

function toUsedSet(schema: ParsedSchema): UsedSet {
  const enumDbNames = new Map(schema.enums.map((e) => [e.name, e.dbName]));
  const tables = new Map<string, UsedTable>(
    schema.models.map((m) => [m.dbName, toTable(m, enumDbNames)]),
  );
  return {
    tables,
    enums: usedEnums(schema, enumDbNames),
    uniqueIndexes: uniqueIndexes(schema),
  };
}

function toTable(model: ParsedModel, enumDbNames: ReadonlyMap<string, string>): UsedTable {
  return {
    model: model.name,
    columns: new Map(model.fields.map((f) => [f.dbName, toColumn(f, enumDbNames)])),
  };
}

function toColumn(field: ParsedField, enumDbNames: ReadonlyMap<string, string>): UsedColumn {
  const enumName = field.kind === 'enum' ? enumDbNames.get(field.type) : undefined;
  return {
    field: field.name,
    prismaType: field.type,
    nativeType: nativeTypeOf(field, enumDbNames),
    isOptional: !field.isRequired,
    isList: field.isList,
    ...(field.default === undefined ? {} : { default: renderDefault(field.default, field.kind) }),
    ...(enumName === undefined ? {} : { enumName }),
  };
}

// An enum is used only if a used column has its type (RULES.md §2), so enums that only ignored
// fields or models refer to stay out.
function usedEnums(
  schema: ParsedSchema,
  enumDbNames: ReadonlyMap<string, string>,
): Map<string, UsedEnum> {
  const used = new Set(
    schema.models.flatMap((m) => m.fields.filter((f) => f.kind === 'enum').map((f) => f.type)),
  );
  return new Map(
    schema.enums
      .filter((e) => used.has(e.name))
      .map((e) => [enumDbNames.get(e.name) ?? e.name, { values: e.values }]),
  );
}

function uniqueIndexes(schema: ParsedSchema): Map<string, UsedUniqueIndex> {
  const models = new Map(schema.models.map((m) => [m.name, m]));
  const result = new Map<string, UsedUniqueIndex>();
  for (const index of schema.uniqueIndexes) {
    // Indexes of @@ignore models: Prisma drops the model but not always its indexes.
    const model = models.get(index.model);
    if (model === undefined) continue;
    const columnOf = new Map(model.fields.map((f) => [f.name, f.dbName]));
    const columns = index.fields.map((name) => columnOf.get(name) ?? name);
    const name =
      index.dbName ??
      defaultIndexName(model.dbName, columns, index.isPrimaryKey ? 'primaryKey' : 'unique');
    result.set(name, { table: model.dbName, columns, isPrimaryKey: index.isPrimaryKey });
  }
  return result;
}

/** Back to schema syntax: `autoincrement()`, `dbgenerated("…")`, `"draft"`, `USER`, `[]`. */
export function renderDefault(value: ParsedDefault, kind: ParsedField['kind']): string {
  if (value.kind === 'function') {
    return `${value.name}(${value.args.map((a) => JSON.stringify(a)).join(', ')})`;
  }
  const literal = (v: string | number | boolean): string =>
    typeof v === 'string' && kind === 'scalar' ? JSON.stringify(v) : String(v);
  // Literals are primitives, so `object` can only be the list case.
  return typeof value.value === 'object'
    ? `[${value.value.map(literal).join(', ')}]`
    : literal(value.value);
}
