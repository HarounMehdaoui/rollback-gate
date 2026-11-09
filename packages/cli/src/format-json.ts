import type { Verdict } from '@rollbackgate/core';

/**
 * The machine report, for CI comments and later the signed predicate. Findings keep the verdict's
 * fixed order, so the same release always gives byte-identical output.
 */
export function formatJson(verdict: Verdict, base: string, head: string): string {
  return `${JSON.stringify({ base, head, ...verdict }, null, 2)}\n`;
}
