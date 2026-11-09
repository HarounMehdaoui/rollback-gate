import type { Change } from '@rollbackgate/core';
import type { DeleteStmt, TruncateStmt, UpdateStmt } from 'libpg-query';

import { publicTable, unrecognized } from './names.js';

/** `UPDATE t SET a = …, b = …`: the columns it writes, for the backfill exception (RG-DB-018). */
export function normalizeUpdate(stmt: UpdateStmt, sql: string): Change[] {
  const table = publicTable(stmt.relation);
  const columns = (stmt.targetList ?? []).flatMap((n) =>
    'ResTarget' in n && n.ResTarget.name !== undefined ? [n.ResTarget.name] : [],
  );
  if (table === null || columns.length === 0) return [unrecognized(sql)];
  return [{ kind: 'UpdateRows', table, columns }];
}

/** `DELETE FROM t …`. */
export function normalizeDelete(stmt: DeleteStmt, sql: string): Change[] {
  const table = publicTable(stmt.relation);
  return table === null ? [unrecognized(sql)] : [{ kind: 'DeleteRows', table }];
}

/** `TRUNCATE a, b`: deletes every row, so one DeleteRows per table. */
export function normalizeTruncate(stmt: TruncateStmt, sql: string): Change[] {
  const tables = (stmt.relations ?? []).map((n) =>
    'RangeVar' in n ? publicTable(n.RangeVar) : null,
  );
  if (tables.length === 0 || tables.some((t) => t === null)) return [unrecognized(sql)];
  return tables.flatMap((table) => (table === null ? [] : [{ kind: 'DeleteRows', table }]));
}
