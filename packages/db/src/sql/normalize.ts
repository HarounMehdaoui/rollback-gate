import type { Change, SourcedChange } from '@rollbackgate/core';
import type { Node } from 'libpg-query';

import { normalizeAlterTable } from './normalizers/alter-table.js';
import { normalizeCreateTable } from './normalizers/create-table.js';
import { normalizeDrop } from './normalizers/drop.js';
import { unrecognized } from './normalizers/names.js';
import { normalizeRename } from './normalizers/rename.js';
import type { ParsedStatement } from './parse-sql.js';

/**
 * Turns one migration's parsed statements into changes, each tagged with its statement, so rules
 * never see SQL or the syntax tree (ARCHITECTURE §10, rule 3). Anything not modelled becomes
 * `Unrecognized` (RG-DB-022): the tool never silently skips a statement it doesn't understand.
 */
export function normalizeMigration(
  migration: string,
  statements: readonly ParsedStatement[],
): SourcedChange[] {
  return statements.flatMap((statement) =>
    normalizeStatement(statement.node, statement.text).map((change) => ({
      change,
      source: { kind: 'statement', migration, statementIndex: statement.index },
    })),
  );
}

/** One statement → zero or more changes. Zero only for statements that can't affect base. */
export function normalizeStatement(node: Node, sql: string): Change[] {
  if ('CreateStmt' in node) return normalizeCreateTable(node.CreateStmt, sql);
  if ('DropStmt' in node) return normalizeDrop(node.DropStmt, sql);
  if ('AlterTableStmt' in node) return normalizeAlterTable(node.AlterTableStmt, sql);
  if ('RenameStmt' in node) return normalizeRename(node.RenameStmt, sql);
  // Prisma wraps some migrations in a transaction; the wrapper changes nothing by itself.
  if ('TransactionStmt' in node) {
    const kind = node.TransactionStmt.kind;
    return kind === 'TRANS_STMT_BEGIN' ||
      kind === 'TRANS_STMT_START' ||
      kind === 'TRANS_STMT_COMMIT'
      ? []
      : [unrecognized(sql)];
  }
  // A diff from an empty database starts with it (RULES.md §4, no-rule table).
  if ('CreateSchemaStmt' in node && node.CreateSchemaStmt.schemaname === 'public') return [];
  return [unrecognized(sql)];
}
