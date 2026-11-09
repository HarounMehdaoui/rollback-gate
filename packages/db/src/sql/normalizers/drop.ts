import type { Change } from '@rollbackgate/core';
import type { DropStmt, Node } from 'libpg-query';

import { publicName, strings, unrecognized } from './names.js';

/**
 * `DROP TABLE a, b`, `DROP INDEX i` and `DROP TYPE e`: one change per object. Prisma drops an index by
 * name only, without its table (RULES.md §6 row 10).
 */
export function normalizeDrop(stmt: DropStmt, sql: string): Change[] {
  const toChange = changeFor(stmt.removeType);
  if (toChange === null) return [unrecognized(sql)];
  const names = (stmt.objects ?? []).map(objectName);
  if (names.length === 0) return [unrecognized(sql)];
  const changes: Change[] = [];
  for (const name of names) {
    if (name === null) return [unrecognized(sql)];
    changes.push(toChange(name));
  }
  return changes;
}

function changeFor(removeType: DropStmt['removeType']): ((name: string) => Change) | null {
  if (removeType === 'OBJECT_TABLE') return (table) => ({ kind: 'DropTable', table });
  if (removeType === 'OBJECT_INDEX') return (name) => ({ kind: 'DropIndex', name });
  if (removeType === 'OBJECT_TYPE') return (enumName) => ({ kind: 'DropEnum', enumName });
  return null;
}

// Tables and indexes come as a List of name parts; types as a TypeName.
function objectName(object: Node): string | null {
  if ('List' in object) return publicName(strings(object.List.items));
  if ('TypeName' in object) return publicName(strings(object.TypeName.names));
  return null;
}
