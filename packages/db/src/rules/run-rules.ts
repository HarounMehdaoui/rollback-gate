import type { Finding, Rule, RuleContext, SourcedChange } from '@rollbackgate/core';

/**
 * Runs every rule on the changes it declares in `appliesTo`, and stamps each hit with the rule's ID
 * and the change's source. Rules share one `Rule[]` because `evaluate` is a method, so the compiler
 * can't stop a rule from receiving the wrong kind (core/src/rule.ts): this check is what does.
 */
export function runRules(
  changes: readonly SourcedChange[],
  ctx: RuleContext,
  rules: readonly Rule[],
): Finding[] {
  return changes.flatMap(({ change, source }) =>
    rules
      .filter((rule) => rule.appliesTo.includes(change.kind))
      .flatMap((rule) =>
        rule.evaluate(change, ctx).map((hit) => ({ ...hit, ruleId: rule.id, source })),
      ),
  );
}
