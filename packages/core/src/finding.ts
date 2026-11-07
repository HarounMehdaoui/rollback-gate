import type { Change } from './change.js';
import type { RuleId } from './rule-id.js';
import type { FindingSeverity } from './severity.js';

/** Where a finding comes from. */
export type FindingSource =
  /** A statement in a migration. The index starts at 0. */
  | { readonly kind: 'statement'; readonly migration: string; readonly statementIndex: number }
  /** A whole migration: edited, removed, or unparsable. */
  | { readonly kind: 'migration'; readonly migration: string }
  /** The release as a whole: config and rehearsal findings. */
  | { readonly kind: 'release' };

export interface Finding {
  readonly ruleId: RuleId;
  readonly severity: FindingSeverity;
  /** e.g. `"User"."name"`. The scenario tests compare this. */
  readonly target: string;
  /** What breaks in base after a rollback. */
  readonly reason: string;
  /** What to do about it. */
  readonly fix: string;
  readonly source: FindingSource;
}

/** A change plus where it came from. The engine copies `source` into findings, so rules don't have to. */
export interface SourcedChange {
  readonly change: Change;
  readonly source: FindingSource;
}
