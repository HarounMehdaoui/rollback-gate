import type { Change } from '@rollbackgate/core';
import type { AlterEnumStmt, CreateEnumStmt } from 'libpg-query';

import { publicName, strings, unrecognized } from './names.js';

/** `CREATE TYPE … AS ENUM (…)`. */
export function normalizeCreateEnum(stmt: CreateEnumStmt, sql: string): Change[] {
  const enumName = publicName(strings(stmt.typeName));
  return enumName === null
    ? [unrecognized(sql)]
    : [{ kind: 'CreateEnum', enumName, values: strings(stmt.vals) }];
}

/** `ALTER TYPE … ADD VALUE`. Renaming a value (`RENAME VALUE`) isn't modelled: Unrecognized. */
export function normalizeAlterEnum(stmt: AlterEnumStmt, sql: string): Change[] {
  const enumName = publicName(strings(stmt.typeName));
  if (enumName === null || stmt.oldVal !== undefined || stmt.newVal === undefined)
    return [unrecognized(sql)];
  return [{ kind: 'AddEnumValue', enumName, value: stmt.newVal }];
}
