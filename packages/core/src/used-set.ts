// The used set is built in packages/db (T1.06). Its type lives in core because RuleContext needs it
// and core can't import db (ARCHITECTURE.md §10, rule 8).

/** One column base's code can read or write (RULES.md §2). */
export interface UsedColumn {
  /** Prisma field name, for messages ("field `name` of model `User`"). */
  readonly field: string;
  /** Prisma type as written in the schema: a scalar (`String`, `Int`, …) or an enum's Prisma name. */
  readonly prismaType: string;
  /**
   * Postgres type, e.g. `varchar(255)`, from `@db.*` or the scalar's default native type.
   * `null` means it couldn't be resolved: type rules must treat that as unknown (RG-DB-008, UNSAFE).
   */
  readonly nativeType: string | null;
  /** `String?` in the schema: base may write NULL (RG-DB-009) and can read NULL (RG-DB-010). */
  readonly isOptional: boolean;
  readonly isList: boolean;
  /**
   * Raw `@default(...)` expression, e.g. `now()`. Absent = no default. Kept raw on purpose: which
   * defaults the database applies is answered by the T1.05 lab, and RG-DB-011 classifies from that.
   */
  readonly default?: string;
  /** Database name of the column's enum type (`@@map` resolved). Present only for enum columns. */
  readonly enumName?: string;
}

/** One table base's code uses. */
export interface UsedTable {
  /** Prisma model name, for messages. */
  readonly model: string;
  /** Keyed by database column name (`@map` resolved), because migration SQL uses database names. */
  readonly columns: ReadonlyMap<string, UsedColumn>;
}

/** One enum base's code uses. */
export interface UsedEnum {
  readonly values: readonly string[];
}

/** Everything base's code can touch in the database, keyed by real database names. */
export interface UsedSet {
  readonly tables: ReadonlyMap<string, UsedTable>;
  readonly enums: ReadonlyMap<string, UsedEnum>;
}
