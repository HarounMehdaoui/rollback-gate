import type { Rule } from '@rollbackgate/core';

const maxTargetLength = 80;

/**
 * RG-DB-022 (RULES.md §4): a statement parsed, but no normalizer models its effect. RISKY,
 * fail-closed: most are harmless (`CREATE EXTENSION`), so UNSAFE would be noise, but it's never
 * silently SAFE.
 */
export const unrecognizedStatementRule: Rule<'Unrecognized'> = {
  id: 'RG-DB-022',
  appliesTo: ['Unrecognized'],
  evaluate(change) {
    return [
      {
        severity: 'RISKY',
        target: shorten(change.sql),
        reason:
          "Rollback Gate understands this statement's syntax but doesn't model its effect on base.",
        fix: 'Check the statement by hand. If it is common, open an issue to add a normalizer.',
      },
    ];
  },
};

// The target is a label for people, so one line, cut at a readable length.
function shorten(sql: string): string {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  return oneLine.length <= maxTargetLength ? oneLine : `${oneLine.slice(0, maxTargetLength - 1)}…`;
}
