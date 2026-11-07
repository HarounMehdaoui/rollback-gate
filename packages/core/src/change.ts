// One normalized effect of a migration statement. Rules only ever see these, never SQL or the AST
// (ARCHITECTURE.md §10, rule 3). Which rule reads which kind: RULES.md §4.

/** Merges an intersection into one plain object type, so hovers and errors show a single shape. */
type Flatten<T> = { [P in keyof T]: T[P] };

/** One variant of `Change`: a fixed `kind` plus its fields. */
type Variant<K extends string, Fields = unknown> = Flatten<{ readonly kind: K } & Fields>;

type OnTable = { readonly table: string };
type OnColumn = { readonly table: string; readonly column: string };
type Renamed = { readonly from: string; readonly to: string };
type OnEnum = { readonly enumName: string };

/** The constraint types `ADD CONSTRAINT` can introduce. */
export type ConstraintType = 'unique' | 'primaryKey' | 'check' | 'foreignKey';

/**
 * A discriminated union on `kind`: check `kind` and TypeScript knows which fields exist.
 * Every kind has its own variant, even when fields repeat, so a rule for `SetNotNull` never
 * receives a type that claims it could also be `DropNotNull`.
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
  // No `fromType`: the SQL only states the new type. Type rules read the old one from the used set.
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
        /** Empty when the columns can't be read from the statement (e.g. some CHECKs). */
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
  // Prisma drops an index by name only, so there is no table here.
  | Variant<'DropIndex', { readonly name: string }>
  | Variant<'RenameIndex', Renamed>
  // enums
  | Variant<'CreateEnum', OnEnum & { readonly values: readonly string[] }>
  | Variant<'AddEnumValue', OnEnum & { readonly value: string }>
  // Produced only by the multi-statement recognizer (ADR-0006, T1.20).
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

/** Every `kind` string. Derived, so adding a variant to `Change` updates it automatically. */
export type ChangeKind = Change['kind'];

/** Each kind mapped to its variant: `ChangeByKind['DropColumn']` is the DropColumn shape. */
export type ChangeByKind = { [C in Change as C['kind']]: C };

/**
 * The variant(s) for the given kind(s), e.g. `ChangeOfKind<'DropColumn'>`.
 * A lookup, not `Extract<>`: TypeScript can't tell how a type parameter varies inside a conditional
 * type, and would then refuse to put a `Rule<'DropColumn'>` in a `Rule[]`.
 */
export type ChangeOfKind<K extends ChangeKind> = ChangeByKind[K];
