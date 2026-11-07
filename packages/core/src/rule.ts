import type { ChangeKind, ChangeOfKind } from './change.js';
import type { Finding } from './finding.js';
import type { RuleId } from './rule-id.js';
import type { UsedSet } from './used-set.js';

/** What every rule gets besides the change itself. Built from base. */
export interface RuleContext {
  /**
   * The only context rules need. Columns added in this release are never in base's used set, which
   * is what makes the backfill exception work without extra context (RULES.md RG-DB-018).
   */
  readonly usedSet: UsedSet;
}

/** What a rule returns for one change. The engine adds `ruleId` and `source`. */
export type RuleHit = Omit<Finding, 'ruleId' | 'source'>;

/**
 * The contract every rule file exports (CONVENTIONS.md "Rules"). `K` is the change kinds the rule
 * handles: `evaluate` receives those variants already narrowed. `Rule` without `K` means "any rule",
 * e.g. in the list the engine runs.
 */
export interface Rule<K extends ChangeKind = ChangeKind> {
  readonly id: RuleId;
  readonly appliesTo: readonly K[];
  /**
   * Returns `[]` when the change doesn't hurt base: that is how a rule says SAFE.
   * Declared as a method on purpose: methods are compared bivariantly, so a `Rule<'DropColumn'>`
   * fits in a `Rule[]`. The engine must therefore only call it for kinds in `appliesTo` (T1.10).
   */
  evaluate(change: ChangeOfKind<K>, ctx: RuleContext): readonly RuleHit[];
}
