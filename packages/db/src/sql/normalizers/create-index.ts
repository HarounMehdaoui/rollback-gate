import type { Change } from '@rollbackgate/core';
import type { IndexStmt } from 'libpg-query';

import { publicTable, unrecognized } from './names.js';

/**
 * `CREATE [UNIQUE] INDEX`. A unique index on an expression (`lower(email)`) has no column names to
 * check against base, so it's Unrecognized rather than a guess; a plain index can't hurt base anyway.
 */
export function normalizeCreateIndex(stmt: IndexStmt, sql: string): Change[] {
  const table = publicTable(stmt.relation);
  if (table === null) return [unrecognized(sql)];
  const elements = (stmt.indexParams ?? []).map((n) =>
    'IndexElem' in n ? n.IndexElem.name : undefined,
  );
  const columns = elements.filter((name): name is string => name !== undefined);
  const name = stmt.idxname === undefined ? {} : { name: stmt.idxname };
  if (stmt.unique !== true) return [{ kind: 'CreateIndex', table, columns, ...name }];
  if (columns.length === 0 || columns.length !== elements.length) return [unrecognized(sql)];
  return [{ kind: 'CreateUniqueIndex', table, columns, ...name }];
}
