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
  /** Raw `@default(...)` text. Left unparsed until the T1.05 lab tells us who applies each default. */
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

/** Everything base's code can touch, by database name. */
export interface UsedSet {
  readonly tables: ReadonlyMap<string, UsedTable>;
  readonly enums: ReadonlyMap<string, UsedEnum>;
}
