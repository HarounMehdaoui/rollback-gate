import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FindingSeverity, RuleId, Severity } from '@rollbackgate/core';

export interface ScenarioDir {
  readonly name: string;
  readonly path: string;
  /** Names starting with `_` are fixtures for the runner itself, not tests of a rule. */
  readonly isFixture: boolean;
}

/** The fields a scenario compares. `reason` and `fix` are left out so wording can change freely. */
export interface ExpectedFinding {
  readonly ruleId: RuleId;
  readonly severity: FindingSeverity;
  readonly target: string;
}

export interface ExpectedResult {
  readonly verdict: Severity;
  readonly findings: readonly ExpectedFinding[];
}

export async function listScenarios(root: string): Promise<ScenarioDir[]> {
  const entries = await readdir(root, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted()
    .map((name) => ({ name, path: join(root, name), isFixture: name.startsWith('_') }));
}

export async function readExpected(scenarioPath: string): Promise<ExpectedResult> {
  const text = await readFile(join(scenarioPath, 'expected.json'), 'utf8');
  return parseExpected(JSON.parse(text));
}

/** Checks an `expected.json` instead of trusting it, so a typo fails loudly instead of matching nothing. */
export function parseExpected(value: unknown): ExpectedResult {
  if (!isRecord(value)) {
    throw new Error('expected.json must be an object');
  }
  checkKeys(value, ['verdict', 'findings'], 'expected.json');
  const { verdict, findings } = value;

  if (verdict !== 'SAFE' && verdict !== 'RISKY' && verdict !== 'UNSAFE') {
    throw new Error(`"verdict" must be SAFE, RISKY or UNSAFE, got ${JSON.stringify(verdict)}`);
  }
  if (!Array.isArray(findings)) {
    throw new Error('"findings" must be an array');
  }

  const parsed = findings.map((finding: unknown, i) => parseFinding(finding, `findings[${i}]`));
  const worst = worstOf(parsed);
  if (verdict !== worst) {
    throw new Error(`"verdict" is ${verdict} but the findings make it ${worst}`);
  }

  return { verdict, findings: parsed };
}

function parseFinding(value: unknown, where: string): ExpectedFinding {
  if (!isRecord(value)) {
    throw new Error(`${where} must be an object`);
  }
  checkKeys(value, ['ruleId', 'severity', 'target'], where);
  const { ruleId, severity, target } = value;

  if (typeof ruleId !== 'string' || !isRuleId(ruleId)) {
    throw new Error(`${where}.ruleId must look like RG-DB-002, got ${JSON.stringify(ruleId)}`);
  }
  if (severity !== 'RISKY' && severity !== 'UNSAFE') {
    throw new Error(`${where}.severity must be RISKY or UNSAFE, got ${JSON.stringify(severity)}`);
  }
  if (typeof target !== 'string' || target === '') {
    throw new Error(`${where}.target must be a non-empty string`);
  }

  return { ruleId, severity, target };
}

// Exact keys only: a typo like "severty" should fail, not be silently ignored.
function checkKeys(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  const actual = Object.keys(value).toSorted();
  const wanted = keys.toSorted();
  if (actual.join() !== wanted.join()) {
    throw new Error(`${where} must have exactly these keys: ${wanted.join(', ')}`);
  }
}

function worstOf(findings: readonly ExpectedFinding[]): Severity {
  if (findings.some((f) => f.severity === 'UNSAFE')) {
    return 'UNSAFE';
  }
  return findings.length > 0 ? 'RISKY' : 'SAFE';
}

function isRuleId(value: string): value is RuleId {
  return /^RG-(DB|CFG|RH)-\d{3}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
