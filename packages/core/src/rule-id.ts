type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type RuleArea = 'DB' | 'CFG' | 'RH';

/** e.g. `RG-DB-002`. Exactly three digits, so a typo like `RG-DB-02` won't compile. */
export type RuleId = `RG-${RuleArea}-${Digit}${Digit}${Digit}`;
