/** Postgres's identifier limit (NAMEDATALEN − 1). Longer names are cut, so Prisma cuts first. */
const maxIdentifierLength = 63;

/**
 * The name Prisma gives a unique index or primary key that the schema doesn't name with `map:`:
 * `<table>_<columns>_key` or `<table>_pkey`, from database names, with the stem cut so the suffix
 * still fits in 63 characters. Prisma's output doesn't include these names (ADR-0004), and
 * `DROP INDEX` carries only the name, so RG-DB-023 needs them recomputed exactly.
 */
export function defaultIndexName(
  table: string,
  columns: readonly string[],
  kind: 'unique' | 'primaryKey',
): string {
  const [stem, suffix] =
    kind === 'primaryKey' ? [table, '_pkey'] : [[table, ...columns].join('_'), '_key'];
  return stem.slice(0, maxIdentifierLength - suffix.length) + suffix;
}
