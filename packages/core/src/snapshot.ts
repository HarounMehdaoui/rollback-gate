/** One migration as read from disk or git by the cli. */
export interface MigrationFile {
  /** Migration folder name, e.g. `20261107120000_add_user`. Prisma's timestamp prefix gives apply order. */
  readonly name: string;
  readonly sql: string;
  /** Hex sha256 of `sql`. Lets the history diff spot an edited migration (RG-DB-020) cheaply. */
  readonly sha256: string;
}

/**
 * Everything the pure analyzers need about one release (base or head). The cli builds it; core and
 * db only read it. Phase 2 adds the env contract.
 */
export interface Snapshot {
  /** Git ref or image digest the snapshot was built from, for messages and the attestation. */
  readonly ref: string;
  /** Raw `schema.prisma` text; db parses it (T1.06). */
  readonly prismaSchema: string;
  /** In apply order: the history diff and the normalizer depend on it. */
  readonly migrations: readonly MigrationFile[];
}
