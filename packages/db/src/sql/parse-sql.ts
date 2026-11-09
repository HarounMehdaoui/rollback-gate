import { hasSqlDetails, loadModule, parseSync, type Node } from 'libpg-query';

// Postgres's own grammar, compiled to WebAssembly (ADR-0005). The WASM module loads asynchronously
// once; after that, parsing is synchronous, so the analyzer stays a plain synchronous function.

export interface ParsedStatement {
  /** 0-based position among the file's statements: `FindingSource.statementIndex`. */
  readonly index: number;
  /** Character offset of the statement in the file. */
  readonly offset: number;
  /** The statement's own text, for messages. */
  readonly text: string;
  /** Postgres's syntax tree for it. Only the normalizer reads this (ARCHITECTURE §10, rule 3). */
  readonly node: Node;
}

export interface SqlSyntaxError {
  readonly message: string;
  /** Character offset where Postgres stopped reading, when it says. */
  readonly offset?: number;
}

export type SqlParseResult =
  | { readonly ok: true; readonly statements: readonly ParsedStatement[] }
  | { readonly ok: false; readonly error: SqlSyntaxError };

let ready = false;

/**
 * Loads the parser. The cli awaits it once before analyzing; parsing without it is a programmer
 * error, not a finding (ADR-0005).
 */
export async function initSqlParser(): Promise<void> {
  await loadModule();
  ready = true;
}

/**
 * Parses one migration file. Invalid SQL is a result, never an exception: the analyzer turns it into
 * an `Unparsable` change (RG-DB-021, UNSAFE). A file with only comments has no statements.
 */
export function parseSql(sql: string): SqlParseResult {
  if (!ready) {
    throw new Error(
      'parseSql was called before initSqlParser() finished; await it once at startup',
    );
  }
  let stmts;
  try {
    stmts = parseSync(sql).stmts ?? [];
  } catch (error) {
    if (!hasSqlDetails(error)) throw error;
    const offset = error.sqlDetails?.cursorPosition;
    return {
      ok: false,
      error: { message: error.message, ...(offset === undefined ? {} : { offset }) },
    };
  }
  const statements: ParsedStatement[] = [];
  for (const [index, raw] of stmts.entries()) {
    // A RawStmt always carries a statement; the field is optional only in the generated types.
    if (raw.stmt === undefined) continue;
    // The first statement may omit its location (= 0); the last may omit its length (= to the end).
    const start = raw.stmt_location ?? 0;
    const end = raw.stmt_len === undefined || raw.stmt_len === 0 ? undefined : start + raw.stmt_len;
    const offset = charOffset(sql, start);
    const text = sql.slice(offset, end === undefined ? undefined : charOffset(sql, end));
    statements.push({ index, offset, text: text.trim(), node: raw.stmt });
  }
  return { ok: true, statements };
}

// libpg-query reports statement positions in UTF-8 bytes; JavaScript strings index UTF-16 code
// units, so a comment like "-- café" before a statement would shift every position without this.
// Written by hand because the pure packages compile without TextEncoder (no DOM or Node types).
function charOffset(sql: string, byteOffset: number): number {
  let bytes = 0;
  let i = 0;
  while (i < sql.length && bytes < byteOffset) {
    const codePoint = sql.codePointAt(i) ?? 0;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
    i += codePoint > 0xffff ? 2 : 1;
  }
  return i;
}
