export const packageName = '@rollbackgate/db';

export { buildUsedSet, type UsedSetResult } from './prisma/used-set.js';
export {
  initSqlParser,
  parseSql,
  type ParsedStatement,
  type SqlParseResult,
  type SqlSyntaxError,
} from './sql/parse-sql.js';
export { diffMigrations, type MigrationDiff } from './migrations/diff-migrations.js';
export { dbRules } from './rules/index.js';
export { runRules } from './rules/run-rules.js';
export { analyzeDb, UnusableBaseSchemaError } from './analyze-db.js';
