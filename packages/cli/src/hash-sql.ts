import { createHash } from 'node:crypto';

/**
 * The migration hash both loaders use (RG-DB-020). CRLF → LF first, so a Windows checkout doesn't look
 * like an edited migration; Prisma's own checksum does the same (RULES.md §6 row 12).
 */
export function hashSql(sql: string): string {
  return createHash('sha256').update(sql.replaceAll('\r\n', '\n'), 'utf8').digest('hex');
}
