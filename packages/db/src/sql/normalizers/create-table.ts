import type { Change } from '@rollbackgate/core';
import type { CreateStmt } from 'libpg-query';

import { publicTable, unrecognized } from './names.js';

/** `CREATE TABLE`: a new table can't be in base's used set, so its columns don't matter. */
export function normalizeCreateTable(stmt: CreateStmt, sql: string): Change[] {
  const table = publicTable(stmt.relation);
  return table === null ? [unrecognized(sql)] : [{ kind: 'CreateTable', table }];
}
