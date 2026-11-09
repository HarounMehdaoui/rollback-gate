import type {
  Analyzer,
  MigrationFile,
  RuleContext,
  Snapshot,
  SourcedChange,
} from '@rollbackgate/core';

import { diffMigrations } from './migrations/diff-migrations.js';
import { buildUsedSet } from './prisma/used-set.js';
import { dbRules } from './rules/index.js';
import { runRules } from './rules/run-rules.js';
import { normalizeMigration } from './sql/normalize.js';
import { recognizeEnumRecreate } from './sql/patterns/enum-recreate.js';
import { parseSql } from './sql/parse-sql.js';

/**
 * Base's schema can't be used (invalid, empty, not PostgreSQL, another schema). It's a tool error,
 * exit code 2, not a finding: it describes the input, not the release (T1.06 decision). The cli
 * catches it at the top.
 */
export class UnusableBaseSchemaError extends Error {
  constructor(reason: string) {
    super(`base schema.prisma can't be used: ${reason}`);
    this.name = 'UnusableBaseSchemaError';
  }
}

/**
 * The DB analyzer (ARCHITECTURE §5 steps 3–6): used set → history diff → parse → normalize →
 * multi-statement patterns (ADR-0006) → rules.
 * Pure: two snapshots in, findings out. The cli must have awaited `initSqlParser()` first.
 */
export const analyzeDb: Analyzer = (base, head) => {
  const { context, changes } = collectDbChanges(base, head);
  return runRules(changes, context, dbRules);
};

/** Everything the rules will see, in source order. Exported for tests. */
export function collectDbChanges(
  base: Snapshot,
  head: Snapshot,
): { context: RuleContext; changes: SourcedChange[] } {
  const usedSet = buildUsedSet(base.prismaSchema);
  if (!usedSet.ok) throw new UnusableBaseSchemaError(usedSet.error);
  const history = diffMigrations(base, head);
  return {
    context: { usedSet: usedSet.usedSet },
    changes: [
      ...history.changes,
      ...history.newMigrations.flatMap((m) => recognizeEnumRecreate(changesOf(m), usedSet.usedSet)),
    ],
  };
}

// A file that doesn't parse becomes one Unparsable change for the whole migration (RG-DB-021):
// after a syntax error Postgres's parser can't say where statements start.
function changesOf(migration: MigrationFile): SourcedChange[] {
  const parsed = parseSql(migration.sql);
  if (parsed.ok) return normalizeMigration(migration.name, parsed.statements);
  const where =
    parsed.error.offset === undefined ? '' : ` at offset ${String(parsed.error.offset)}`;
  return [
    {
      change: { kind: 'Unparsable', sql: migration.sql, error: `${parsed.error.message}${where}` },
      source: { kind: 'migration', migration: migration.name },
    },
  ];
}
