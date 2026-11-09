import { assertNever, type Finding, type FindingSource, type Verdict } from '@rollbackgate/core';

/**
 * The human report: one block per finding, worst first, then the verdict line. Same layout as the
 * README example: severity, rule ID and what's affected, then why base breaks and the fix.
 */
export function formatText(verdict: Verdict, base: string, head: string): string {
  const lines = [`Rollback Gate: can ${head} be rolled back to ${base}?`, ''];
  for (const finding of verdict.findings) lines.push(...findingLines(finding), '');
  const { unsafe, risky } = verdict.counts;
  lines.push(`Verdict: ${verdict.verdict} (${String(unsafe)} unsafe, ${String(risky)} risky)`);
  return `${lines.join('\n')}\n`;
}

function findingLines(finding: Finding): string[] {
  const where = location(finding.source);
  const severity = finding.severity.padEnd(7);
  return [
    `${severity} ${finding.ruleId}  ${finding.target}${where === '' ? '' : `  (${where})`}`,
    `        Why:  ${finding.reason}`,
    `        Fix:  ${finding.fix}`,
  ];
}

function location(source: FindingSource): string {
  switch (source.kind) {
    case 'statement':
      return `${source.migration}, statement ${String(source.statementIndex + 1)}`;
    case 'migration':
      return source.migration;
    case 'release':
      return '';
    default:
      return assertNever(source);
  }
}
