export interface MigrationFile {
  /** Folder name, e.g. `20261107120000_add_user`. The timestamp gives the order. */
  readonly name: string;
  readonly sql: string;
  /** Hash of `sql`, used to spot edited migrations (RG-DB-020). */
  readonly sha256: string;
}

/** One release (base or head), as loaded by the cli. The env contract comes in Phase 2. */
export interface Snapshot {
  /** Git ref or image digest. */
  readonly ref: string;
  readonly prismaSchema: string;
  /** In apply order. */
  readonly migrations: readonly MigrationFile[];
}
