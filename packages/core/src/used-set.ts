// Built in db (T1.06), but the type lives here because rules need it and core can't import db.

/** A column base's code reads or writes. */
export interface UsedColumn {
  /** Prisma field name, for messages. */
  readonly field: string;
  /** As written in the schema: `String`, `Int`, or an enum name. */
  readonly prismaType: string;
  /** Postgres type, e.g. `varchar(255)`. `null` if we couldn't tell, which RG-DB-008 treats as UNSAFE. */
  readonly nativeType: string | null;
  readonly isOptional: boolean;
  readonly isList: boolean;
  /** Raw `@default(...)` text. Only `autoincrement()` and `dbgenerated()` are applied by the database. */
  readonly default?: string;
  /** Database name of the enum, for enum columns. */
  readonly enumName?: string;
}

/** A table base's code uses. */
export interface UsedTable {
  /** Prisma model name, for messages. */
  readonly model: string;
  /** By database column name, since that's what the SQL uses. */
  readonly columns: ReadonlyMap<string, UsedColumn>;
}

export interface UsedEnum {
  readonly values: readonly string[];
}

/**
 * A unique index or primary key on a used table. Base's `upsert` relies on it (`ON CONFLICT`), so
 * RG-DB-023 needs to recognize it when a migration drops it by name.
 */
export interface UsedUniqueIndex {
  /** Database name of the table. */
  readonly table: string;
  /** Database names of the indexed columns, in index order. */
  readonly columns: readonly string[];
  readonly isPrimaryKey: boolean;
}

/** Everything base's code can touch, by database name. */
export interface UsedSet {
  readonly tables: ReadonlyMap<string, UsedTable>;
  readonly enums: ReadonlyMap<string, UsedEnum>;
  /**
   * By index name: `DROP INDEX` carries only the name, and Postgres index names are unique per
   * schema (Phase 1 supports only `public`).
   */
  readonly uniqueIndexes: ReadonlyMap<string, UsedUniqueIndex>;
}
