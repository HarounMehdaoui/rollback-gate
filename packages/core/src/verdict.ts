import type { Finding } from './finding.js';
import type { Severity } from './severity.js';

/** The final answer for a release, produced by the verdict engine (T1.03). */
export interface Verdict {
  /** The worst finding's severity, or SAFE when there are none: the only place SAFE appears. */
  readonly verdict: Severity;
  /** Sorted: UNSAFE first, then source order. */
  readonly findings: readonly Finding[];
  /** No `safe` count: SAFE means "no findings", so there is nothing to count. */
  readonly counts: { readonly unsafe: number; readonly risky: number };
}
