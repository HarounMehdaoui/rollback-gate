import type { Finding } from './finding.js';
import type { Severity } from './severity.js';

export interface Verdict {
  /** The worst finding, or SAFE if there are none. */
  readonly verdict: Severity;
  /** UNSAFE first, then by source, rule ID and target (RULES.md §3). */
  readonly findings: readonly Finding[];
  /** No `safe` count: SAFE just means there were no findings. */
  readonly counts: { readonly unsafe: number; readonly risky: number };
}
