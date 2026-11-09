import type { Change } from '@rollbackgate/core';
import type { DropStmt } from 'libpg-query';

import { strings, unrecognized } from './names.js';

/** `DROP TABLE a, b`: one change per table. Other `DROP`s (index, type) come in T1.17. */
export function normalizeDrop(stmt: DropStmt, sql: string): Change[] {
  if (stmt.removeType !== 'OBJECT_TABLE') return [unrecognized(sql)];
  const tables = (stmt.objects ?? []).map((object) =>
    'List' in object ? tableOf(strings(object.List.items)) : null,
  );
  if (tables.length === 0 || tables.some((t) => t === null)) return [unrecognized(sql)];
  return tables.flatMap((table) => (table === null ? [] : [{ kind: 'DropTable', table }]));
}

// `["User"]` or `["public", "User"]`; any other schema isn't modelled in Phase 1.
function tableOf(parts: readonly string[]): string | null {
  if (parts.length === 1) return parts[0] ?? null;
  if (parts.length === 2 && parts[0] === 'public') return parts[1] ?? null;
  return null;
}
