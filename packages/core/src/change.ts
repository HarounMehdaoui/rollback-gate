// What a migration statement does, in a form rules can read. Rules never see raw SQL.

// Turns `A & B` into one plain object type, so tests can compare variants to a flat shape.
type Flatten<T> = { [P in keyof T]: T[P] };

type Variant<K extends string, Fields = unknown> = Flatten<{ readonly kind: K } & Fields>;

type OnTable = { readonly table: string };
type OnColumn = { readonly table: string; readonly column: string };
type Renamed = { readonly from: string; readonly to: string };
type OnEnum = { readonly enumName: string };

export type ConstraintType = 'unique' | 'primaryKey' | 'check' | 'foreignKey';

/**
 * Check `kind` and TypeScript knows which fields you have. Each kind gets its own variant, even
 * when the fields are the same, so a SetNotNull rule never gets something that might be DropNotNull.
 */
export type Change =
  // tables
  | Variant<'CreateTable', OnTable>
  | Variant<'DropTable', OnTable>
  | Variant<'RenameTable', Renamed>
  // columns
  | Variant<'AddColumn', OnColumn & { readonly isNullable: boolean; readonly hasDefault: boolean }>
  | Variant<'DropColumn', OnColumn>
  | Variant<'RenameColumn', OnTable & Renamed>
  // No old type here: the SQL doesn't say it. Rules get it from the used set.
  | Variant<'AlterColumnType', OnColumn & { readonly toType: string; readonly hasUsing: boolean }>
  | Variant<'SetNotNull', OnColumn>
  | Variant<'DropNotNull', OnColumn>
  | Variant<'SetDefault', OnColumn>
  | Variant<'DropDefault', OnColumn>
  // constraints and indexes
  | Variant<
      'AddConstraint',
      OnTable & {
        readonly constraint: ConstraintType;
        /** Can be empty, e.g. for some CHECKs. */
        readonly columns: readonly string[];
        readonly name?: string;
      }
    >
  | Variant<'DropConstraint', OnTable & { readonly name: string }>
  | Variant<
      'CreateIndex',
      OnTable & { readonly columns: readonly string[]; readonly name?: string }
    >
  | Variant<
      'CreateUniqueIndex',
      OnTable & { readonly columns: readonly string[]; readonly name?: string }
    >
  // Prisma drops indexes by name only, so no table.
  | Variant<'DropIndex', { readonly name: string }>
  | Variant<'RenameIndex', Renamed>
  // enums
  | Variant<'CreateEnum', OnEnum & { readonly values: readonly string[] }>
  | Variant<'AddEnumValue', OnEnum & { readonly value: string }>
  // Only produced by the enum recreate recognizer (T1.20).
  | Variant<'RemoveEnumValue', OnEnum & { readonly value: string }>
  | Variant<'RenameEnum', Renamed>
  | Variant<'DropEnum', OnEnum>
  // data
  | Variant<'UpdateRows', OnTable & { readonly columns: readonly string[] }>
  // DELETE and TRUNCATE
  | Variant<'DeleteRows', OnTable>
  // migration history
  | Variant<
      'EditedMigration',
      { readonly migration: string; readonly edit: 'modified' | 'removed' }
    >
  // fail-closed
  | Variant<'Unparsable', { readonly sql: string; readonly error: string }>
  | Variant<'Unrecognized', { readonly sql: string }>;

/** All the kind names. Derived, so it can't get out of sync. */
export type ChangeKind = Change['kind'];

/** Kind name → its variant. */
export type ChangeByKind = { [C in Change as C['kind']]: C };

/**
 * The variant for a kind, e.g. `ChangeOfKind<'DropColumn'>`.
 * A lookup instead of `Extract<>`, because with `Extract` a `Rule<'DropColumn'>` doesn't fit in a `Rule[]`.
 */
export type ChangeOfKind<K extends ChangeKind> = ChangeByKind[K];
