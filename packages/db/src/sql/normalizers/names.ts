import type { Change } from '@rollbackgate/core';
import type { Node, RangeVar } from 'libpg-query';

/**
 * The table a statement targets, or `null` if it's outside `public`: Phase 1 supports only the
 * default schema, so anything else must become `Unrecognized` (RULES.md §2), never a silent match on
 * a same-named public table. Postgres already lower-cases unquoted names while parsing.
 */
export function publicTable(relation: RangeVar | undefined): string | null {
  if (relation?.relname === undefined) return null;
  if (relation.schemaname !== undefined && relation.schemaname !== 'public') return null;
  return relation.relname;
}

/** The text of a list of `String` nodes, e.g. a qualified name `["public", "User"]`. */
export function strings(nodes: readonly Node[] | undefined): string[] {
  return (nodes ?? []).flatMap((n) =>
    'String' in n && n.String.sval !== undefined ? [n.String.sval] : [],
  );
}

/**
 * An object name from its parts: `["User"]` or `["public", "User"]`. Any other schema isn't modelled
 * in Phase 1, so it gives `null` (the caller marks the statement Unrecognized).
 */
export function publicName(parts: readonly string[]): string | null {
  if (parts.length === 1) return parts[0] ?? null;
  if (parts.length === 2 && parts[0] === 'public') return parts[1] ?? null;
  return null;
}

/** The fail-closed answer for SQL that parsed but that no normalizer models (RG-DB-022, RISKY). */
export function unrecognized(sql: string): Change {
  return { kind: 'Unrecognized', sql };
}
