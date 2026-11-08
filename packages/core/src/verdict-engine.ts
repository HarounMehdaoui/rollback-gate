import { assertNever } from './assert-never.js';
import type { Finding, FindingSource } from './finding.js';
import type { FindingSeverity, Severity } from './severity.js';
import type { Verdict } from './verdict.js';

/**
 * Turns findings into the verdict for a release: the worst severity wins, and no findings means SAFE.
 *
 * Findings come back in a fixed order that doesn't depend on the input order, so the same findings
 * always give the same report. Duplicates are kept: they point to a bug upstream.
 *
 * @throws Error if a finding has a severity rules can't report (bad data that got past the types).
 */
export function computeVerdict(findings: readonly Finding[]): Verdict {
  const counts = countBySeverity(findings);

  return {
    verdict: worstSeverity(counts),
    findings: findings.toSorted(compareFindings),
    counts,
  };
}

function countBySeverity(findings: readonly Finding[]): Verdict['counts'] {
  let unsafe = 0;
  let risky = 0;

  for (const finding of findings) {
    switch (finding.severity) {
      case 'UNSAFE':
        unsafe += 1;
        break;
      case 'RISKY':
        risky += 1;
        break;
      default:
        // A SAFE finding from JSON would land here. Throwing beats silently counting it as nothing.
        return assertNever(finding.severity);
    }
  }

  return { unsafe, risky };
}

function worstSeverity(counts: Verdict['counts']): Severity {
  if (counts.unsafe > 0) {
    return 'UNSAFE';
  }
  if (counts.risky > 0) {
    return 'RISKY';
  }
  return 'SAFE';
}

const severityRank: Record<FindingSeverity, number> = { UNSAFE: 0, RISKY: 1 };

// Every tie is broken, so the output never depends on the input order.
function compareFindings(a: Finding, b: Finding): number {
  return (
    severityRank[a.severity] - severityRank[b.severity] ||
    compareSources(a.source, b.source) ||
    compareText(a.ruleId, b.ruleId) ||
    compareText(a.target, b.target)
  );
}

// Migrations in apply order, whole-migration findings before that migration's statements, and
// release-wide findings (config, rehearsal) last.
function compareSources(a: FindingSource, b: FindingSource): number {
  const [groupA, migrationA, positionA] = sortKey(a);
  const [groupB, migrationB, positionB] = sortKey(b);

  return groupA - groupB || compareText(migrationA, migrationB) || positionA - positionB;
}

function sortKey(source: FindingSource): [group: number, migration: string, position: number] {
  switch (source.kind) {
    case 'migration':
      return [0, source.migration, -1];
    case 'statement':
      return [0, source.migration, source.statementIndex];
    case 'release':
      return [1, '', 0];
    default:
      return assertNever(source);
  }
}

// Plain code-unit order, not localeCompare: the result must be the same on every machine.
// Prisma names start with a timestamp, so this is also their apply order.
function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
