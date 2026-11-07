/** The verdict for a release. */
export type Severity = 'SAFE' | 'RISKY' | 'UNSAFE';

/** What a rule can report. A rule says "safe" by returning nothing. */
export type FindingSeverity = Exclude<Severity, 'SAFE'>;
