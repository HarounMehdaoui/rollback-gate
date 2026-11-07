/** The answer for a release (RULES.md §3). */
export type Severity = 'SAFE' | 'RISKY' | 'UNSAFE';

/**
 * The severities a rule may emit. A rule says "safe" by returning no finding, never a SAFE finding
 * (RULES.md §3), so SAFE is excluded here and the compiler enforces it.
 */
export type FindingSeverity = Exclude<Severity, 'SAFE'>;
