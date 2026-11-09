import type { Change, ConstraintType } from '@rollbackgate/core';
import type { AlterTableCmd, AlterTableStmt, ColumnDef, Constraint } from 'libpg-query';

import { publicTable, strings, unrecognized } from './names.js';
import { postgresTypeName } from './type-name.js';

/**
 * `ALTER TABLE` with one or more actions. Prisma's rename is a single statement
 * `DROP COLUMN …, ADD COLUMN …`, so each action becomes its own change. If any action isn't
 * modelled yet, the statement also yields one `Unrecognized`: the known actions still get checked,
 * and the unknown one still raises a warning (fail-closed).
 */
export function normalizeAlterTable(stmt: AlterTableStmt, sql: string): Change[] {
  const table = publicTable(stmt.relation);
  if (table === null || stmt.objtype !== 'OBJECT_TABLE') return [unrecognized(sql)];
  const changes: Change[] = [];
  let unknown = false;
  for (const node of stmt.cmds ?? []) {
    const cmd = 'AlterTableCmd' in node ? normalizeCmd(table, node.AlterTableCmd) : null;
    if (cmd === null) unknown = true;
    else changes.push(...cmd);
  }
  return unknown || changes.length === 0 ? [...changes, unrecognized(sql)] : changes;
}

// Plain ifs, not a switch: Postgres has ~70 ALTER TABLE action types and only a few are modelled;
// every other one falls through to `null` (unrecognized).
function normalizeCmd(table: string, cmd: AlterTableCmd): Change[] | null {
  if (cmd.subtype === 'AT_AddColumn') {
    return cmd.def !== undefined && 'ColumnDef' in cmd.def
      ? addColumn(table, cmd.def.ColumnDef)
      : null;
  }
  if (cmd.subtype === 'AT_AddConstraint') return addConstraint(table, cmd);
  const column = cmd.name;
  if (column === undefined) return null;
  if (cmd.subtype === 'AT_DropConstraint') return [{ kind: 'DropConstraint', table, name: column }];
  if (cmd.subtype === 'AT_DropColumn') return [{ kind: 'DropColumn', table, column }];
  if (cmd.subtype === 'AT_SetNotNull') return [{ kind: 'SetNotNull', table, column }];
  if (cmd.subtype === 'AT_DropNotNull') return [{ kind: 'DropNotNull', table, column }];
  // SET DEFAULT carries the expression in `def`; DROP DEFAULT has none.
  if (cmd.subtype === 'AT_ColumnDefault') {
    return [{ kind: cmd.def === undefined ? 'DropDefault' : 'SetDefault', table, column }];
  }
  if (cmd.subtype === 'AT_AlterColumnType') return alterColumnType(table, column, cmd);
  return null;
}

// ADD CONSTRAINT carries no column `name`, so it's handled before the column actions.
function addConstraint(table: string, cmd: AlterTableCmd): Change[] | null {
  if (cmd.def === undefined || !('Constraint' in cmd.def)) return null;
  const c = cmd.def.Constraint;
  const constraint = constraintTypes[c.contype ?? ''];
  if (constraint === undefined) return null;
  // A foreign key lists its own columns in fk_attrs; unique and primary keys in keys; a CHECK has none.
  const columns = strings(c.contype === 'CONSTR_FOREIGN' ? c.fk_attrs : c.keys);
  return [
    {
      kind: 'AddConstraint',
      table,
      constraint,
      columns,
      ...(c.conname === undefined ? {} : { name: c.conname }),
    },
  ];
}

// The old type isn't in the SQL: the type rules take it from base's used set (T1.16).
function alterColumnType(table: string, column: string, cmd: AlterTableCmd): Change[] | null {
  const def = cmd.def !== undefined && 'ColumnDef' in cmd.def ? cmd.def.ColumnDef : undefined;
  const toType = postgresTypeName(def?.typeName);
  if (toType === null) return null;
  // `USING expr` is stored as the column definition's raw_default.
  return [
    { kind: 'AlterColumnType', table, column, toType, hasUsing: def?.raw_default !== undefined },
  ];
}

const serialTypes = new Set([
  'serial',
  'serial2',
  'serial4',
  'serial8',
  'smallserial',
  'bigserial',
]);
const notNullConstraints = new Set(['CONSTR_NOTNULL', 'CONSTR_PRIMARY', 'CONSTR_IDENTITY']);
const defaultConstraints = new Set(['CONSTR_DEFAULT', 'CONSTR_IDENTITY', 'CONSTR_GENERATED']);
const constraintTypes: Readonly<Record<string, ConstraintType>> = {
  CONSTR_UNIQUE: 'unique',
  CONSTR_PRIMARY: 'primaryKey',
  CONSTR_CHECK: 'check',
  CONSTR_FOREIGN: 'foreignKey',
};

function addColumn(table: string, def: ColumnDef): Change[] | null {
  const column = def.colname;
  if (column === undefined) return null;
  const constraints = (def.constraints ?? []).flatMap((n) =>
    'Constraint' in n ? [n.Constraint] : [],
  );
  const typeName = strings(def.typeName?.names).at(-1) ?? '';
  const add: Change = {
    kind: 'AddColumn',
    table,
    column,
    // Primary key and identity columns are NOT NULL even without the keyword.
    isNullable: !(
      def.is_not_null === true || constraints.some((c) => notNullConstraints.has(c.contype ?? ''))
    ),
    // serial is shorthand for a sequence default; identity and generated columns are filled by the DB.
    hasDefault:
      serialTypes.has(typeName) || constraints.some((c) => defaultConstraints.has(c.contype ?? '')),
  };
  return [add, ...constraints.flatMap((c) => inlineConstraint(table, column, c))];
}

// `ADD COLUMN x … UNIQUE` also adds a constraint; keep it visible for the constraint rules (T1.18).
function inlineConstraint(table: string, column: string, c: Constraint): Change[] {
  const constraint = constraintTypes[c.contype ?? ''];
  if (constraint === undefined) return [];
  return [
    {
      kind: 'AddConstraint',
      table,
      constraint,
      columns: [column],
      ...(c.conname === undefined ? {} : { name: c.conname }),
    },
  ];
}
