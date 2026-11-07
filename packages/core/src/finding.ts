import type { Change } from './change.js';
import type { RuleId } from './rule-id.js';
import type { FindingSeverity } from './severity.js';

/** Where a finding comes from (ARCHITECTURE.md §3). */
export type FindingSource =
  /** One statement of a migration. `statementIndex` is 0-based; the cli may print it 1-based. */
  | { readonly kind: 'statement'; readonly migration: string; readonly statementIndex: number }
  /** A whole migration: an edited or removed one (RG-DB-020), or a file that didn't parse (RG-DB-021). */
  | { readonly kind: 'migration'; readonly migration: string }
  /** The release as a whole: config contract (RG-CFG-*) and rehearsal (RG-RH-*). */
  | { readonly kind: 'release' };

/** One problem a rule found. Rules emit only RISKY or UNSAFE findings (RULES.md §3). */
export interface Finding {
  readonly ruleId: RuleId;
  readonly severity: FindingSeverity;
  /** What it's about, in SQL quoting, e.g. `"User"."name"`. Compared by the scenario runner. */
  readonly target: string;
  /** What breaks in base after a rollback. */
  readonly reason: string;
  /** A concrete next action. */
  readonly fix: string;
  readonly source: FindingSource;
}

/**
 * A change with the place it came from. The normalizer returns these, and the rule engine copies
 * `source` into each finding, so rules never deal with locations.
 */
export interface SourcedChange {
  readonly change: Change;
  readonly source: FindingSource;
}
