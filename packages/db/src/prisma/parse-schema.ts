import { getDMMF, type GetDMMFError } from '@prisma/get-dmmf';
import { get_config } from '@prisma/prisma-schema-wasm';

// The only file that knows Prisma's output shape (ADR-0004: not a documented public API). Everything
// else reads the small types below, so a Prisma upgrade breaks this file and its tests, not the rules.

type Literal = string | number | boolean;

export type ParsedDefault =
  | {
      readonly kind: 'function';
      readonly name: string;
      readonly args: readonly (string | number)[];
    }
  | { readonly kind: 'literal'; readonly value: Literal | readonly Literal[] };

/** A field that has a column: relation fields and `Unsupported` fields are left out. */
export interface ParsedField {
  readonly name: string;
  /** `@map` resolved: the column name the SQL uses. */
  readonly dbName: string;
  readonly kind: 'scalar' | 'enum';
  /** Prisma scalar (`String`, `Int`, …) or, for enum fields, the enum's Prisma name. */
  readonly type: string;
  /** `@db.VarChar(255)` → `{ name: 'VarChar', args: ['255'] }`; `null` without `@db.*`. */
  readonly nativeType: { readonly name: string; readonly args: readonly string[] } | null;
  readonly isRequired: boolean;
  readonly isList: boolean;
  readonly default?: ParsedDefault;
}

export interface ParsedModel {
  readonly name: string;
  /** `@@map` resolved: the table name the SQL uses. */
  readonly dbName: string;
  readonly fields: readonly ParsedField[];
}

export interface ParsedEnum {
  readonly name: string;
  readonly dbName: string;
  /** Value names as stored in the database (`@map` resolved). */
  readonly values: readonly string[];
}

/** A unique index or primary key. `dbName` is set only when the schema names it (`map:`). */
export interface ParsedUniqueIndex {
  readonly model: string;
  readonly isPrimaryKey: boolean;
  readonly dbName?: string;
  /** Prisma field names, in index order. */
  readonly fields: readonly string[];
}

export interface ParsedSchema {
  readonly models: readonly ParsedModel[];
  readonly enums: readonly ParsedEnum[];
  readonly uniqueIndexes: readonly ParsedUniqueIndex[];
}

export type SchemaParseResult =
  | { readonly ok: true; readonly schema: ParsedSchema }
  | { readonly ok: false; readonly error: string };

type Document = Exclude<ReturnType<typeof getDMMF>, GetDMMFError>;
type DmmfModel = Document['datamodel']['models'][number];
type DmmfField = DmmfModel['fields'][number];

const ansiColor = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * Reads a base `schema.prisma` with Prisma's own engine. Fails closed: an invalid schema, a schema
 * without a PostgreSQL datasource, one with no models, or one with a model outside `public` is an
 * error, never an empty result, because an empty used set would make every drop look SAFE.
 */
export function parsePrismaSchema(schemaText: string): SchemaParseResult {
  const dmmf = getDMMF({ datamodel: schemaText });
  if ('error' in dmmf) return fail(`invalid Prisma schema: ${dmmfErrorMessage(dmmf)}`);

  const providerError = checkDatasource(schemaText);
  if (providerError !== undefined) return fail(providerError);

  const { models, enums, indexes } = dmmf.datamodel;
  if (models.length === 0) return fail('the Prisma schema has no models');
  const outside = models.find((m) => m.schema !== null && m.schema !== 'public');
  if (outside !== undefined) {
    return fail(
      `model ${outside.name} is in schema "${outside.schema ?? ''}"; only "public" is supported`,
    );
  }

  return {
    ok: true,
    schema: {
      models: models.map(toModel),
      enums: enums.map((e) => ({
        name: e.name,
        dbName: e.dbName ?? e.name,
        values: e.values.map((v) => v.dbName ?? v.name),
      })),
      uniqueIndexes: indexes
        .filter((i) => i.type === 'id' || i.type === 'unique')
        .map((i) => ({
          model: i.model,
          isPrimaryKey: i.type === 'id',
          ...(i.dbName === undefined ? {} : { dbName: i.dbName }),
          fields: i.fields.map((f) => f.name),
        })),
    },
  };
}

function fail(error: string): SchemaParseResult {
  return { ok: false, error };
}

// The engine wraps its diagnostic in JSON inside the error message; fall back to the raw reason.
function dmmfErrorMessage(err: GetDMMFError): string {
  let message = err.reason;
  try {
    const parsed: unknown = JSON.parse(err.error.message);
    if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
      message = String(parsed.message);
    }
  } catch {
    // Not JSON: keep the reason.
  }
  return message.replace(ansiColor, '');
}

// getDMMF doesn't report datasources (an empty or datasource-less schema parses fine), so the
// provider comes from the same engine's config reader.
function checkDatasource(schemaText: string): string | undefined {
  let providers: string[];
  try {
    const raw: unknown = JSON.parse(
      get_config(
        JSON.stringify({
          prismaSchema: schemaText,
          datasourceOverrides: {},
          ignoreEnvVarErrors: true,
          env: {},
        }),
      ),
    );
    providers = readProviders(raw);
  } catch (error) {
    return `could not read the Prisma datasource: ${String(error)}`;
  }
  if (providers.length === 0) return 'the Prisma schema has no datasource';
  if (providers.some((p) => p !== 'postgresql')) {
    return `unsupported datasource provider "${providers.join(', ')}"; only "postgresql" is supported`;
  }
  return undefined;
}

function readProviders(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null || !('config' in raw)) return [];
  const config: unknown = raw.config;
  if (typeof config !== 'object' || config === null || !('datasources' in config)) return [];
  const sources: unknown = config.datasources;
  if (!Array.isArray(sources)) return [];
  return sources.map((s: unknown) =>
    typeof s === 'object' && s !== null && 'activeProvider' in s
      ? String(s.activeProvider)
      : 'unknown',
  );
}

function toModel(model: DmmfModel): ParsedModel {
  return {
    name: model.name,
    dbName: model.dbName ?? model.name,
    fields: model.fields.flatMap(toField),
  };
}

function toField(field: DmmfField): ParsedField[] {
  if (field.kind !== 'scalar' && field.kind !== 'enum') return [];
  const parsedDefault = toDefault(field.default);
  return [
    {
      name: field.name,
      dbName: field.dbName ?? field.name,
      kind: field.kind,
      type: field.type,
      nativeType: field.nativeType
        ? { name: field.nativeType[0], args: [...field.nativeType[1]] }
        : null,
      isRequired: field.isRequired,
      isList: field.isList,
      ...(parsedDefault === undefined ? {} : { default: parsedDefault }),
    },
  ];
}

function toDefault(value: DmmfField['default']): ParsedDefault | undefined {
  if (value === undefined) return undefined;
  if (isLiteralList(value)) return { kind: 'literal', value: [...value] };
  if (typeof value === 'object')
    return { kind: 'function', name: value.name, args: [...value.args] };
  return { kind: 'literal', value };
}

// Array.isArray doesn't narrow readonly arrays, so the list case needs its own guard.
function isLiteralList(value: NonNullable<DmmfField['default']>): value is readonly Literal[] {
  return Array.isArray(value);
}
