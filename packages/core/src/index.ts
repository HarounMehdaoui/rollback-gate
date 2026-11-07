// Still used by the cli wiring test. Remove once cli imports real exports.
export const packageName = '@rollbackgate/core';

export { assertNever } from './assert-never.js';
export type { Analyzer } from './analyzer.js';
export type { Change, ChangeKind, ChangeOfKind, ConstraintType } from './change.js';
export type { Finding, FindingSource, SourcedChange } from './finding.js';
export type { Rule, RuleContext, RuleHit } from './rule.js';
export type { RuleArea, RuleId } from './rule-id.js';
export type { FindingSeverity, Severity } from './severity.js';
export type { MigrationFile, Snapshot } from './snapshot.js';
export type { UsedColumn, UsedEnum, UsedSet, UsedTable } from './used-set.js';
export type { Verdict } from './verdict.js';
