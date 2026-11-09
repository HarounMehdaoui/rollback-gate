import type { Change } from '@rollbackgate/core';
import type { RenameStmt } from 'libpg-query';

import { publicTable, unrecognized } from './names.js';

/** `ALTER TABLE … RENAME COLUMN … TO …` and `ALTER TABLE … RENAME TO …`. Index renames: T1.17. */
export function normalizeRename(stmt: RenameStmt, sql: string): Change[] {
  const table = publicTable(stmt.relation);
  const to = stmt.newname;
  if (table === null || to === undefined) return [unrecognized(sql)];
  if (stmt.renameType === 'OBJECT_TABLE') return [{ kind: 'RenameTable', from: table, to }];
  if (
    stmt.renameType === 'OBJECT_COLUMN' &&
    stmt.relationType === 'OBJECT_TABLE' &&
    stmt.subname !== undefined
  ) {
    return [{ kind: 'RenameColumn', table, from: stmt.subname, to }];
  }
  return [unrecognized(sql)];
}
