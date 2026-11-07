import type { ChangeKind, ChangeOfKind } from './change.js';
import type { Finding } from './finding.js';
import type { RuleId } from './rule-id.js';
import type { UsedSet } from './used-set.js';

export interface RuleContext {
  /** Base's used set. Columns added in this release aren't in it, which is why backfills pass. */
  readonly usedSet: UsedSet;
}

/** What a rule returns. The engine adds `ruleId` and `source`. */
export type RuleHit = Omit<Finding, 'ruleId' | 'source'>;

/**
 * What every rule file exports. `K` is the kinds it handles, and `evaluate` gets them already
 * narrowed. Plain `Rule` means any rule.
 */
export interface Rule<K extends ChangeKind = ChangeKind> {
  readonly id: RuleId;
  readonly appliesTo: readonly K[];
  /**
   * Return `[]` if the change is fine for base.
   *
   * It's a method on purpose: that lets rules of different kinds share one `Rule[]`. The catch is
   * that the engine must only call it for kinds in `appliesTo` (T1.10).
   */
  evaluate(change: ChangeOfKind<K>, ctx: RuleContext): readonly RuleHit[];
}
