import type { Change } from '@rollbackgate/core';
import type { RenameStmt } from 'libpg-query';

import { publicName, publicTable, strings, unrecognized } from './names.js';

/**
 * Renames of tables, columns, indexes, constraints and enum types. A constraint rename is a
 * `RenameIndex`: base never refers to indexes or constraints by name (RULES.md §4, no-rule table).
 */
export function normalizeRename(stmt: RenameStmt, sql: string): Change[] {
  const to = stmt.newname;
  if (to === undefined) return [unrecognized(sql)];
  const change = renameChange(stmt, to);
  return change === null ? [unrecognized(sql)] : [change];
}

function renameChange(stmt: RenameStmt, to: string): Change | null {
  if (stmt.renameType === 'OBJECT_TYPE') {
    const from =
      stmt.object !== undefined && 'List' in stmt.object
        ? publicName(strings(stmt.object.List.items))
        : null;
    return from === null ? null : { kind: 'RenameEnum', from, to };
  }
  const relation = publicTable(stmt.relation);
  if (relation === null) return null;
  if (stmt.renameType === 'OBJECT_TABLE') return { kind: 'RenameTable', from: relation, to };
  // ALTER INDEX "old" RENAME TO "new": the index name sits where a table name would.
  if (stmt.renameType === 'OBJECT_INDEX') return { kind: 'RenameIndex', from: relation, to };
  if (stmt.subname === undefined) return null;
  if (stmt.renameType === 'OBJECT_TABCONSTRAINT')
    return { kind: 'RenameIndex', from: stmt.subname, to };
  if (stmt.renameType === 'OBJECT_COLUMN' && stmt.relationType === 'OBJECT_TABLE') {
    return { kind: 'RenameColumn', table: relation, from: stmt.subname, to };
  }
  return null;
}
