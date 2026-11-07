type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** The areas rule IDs belong to (CONVENTIONS.md "Naming"). */
export type RuleArea = 'DB' | 'CFG' | 'RH';

/**
 * A stable rule ID, `RG-<AREA>-<NNN>`, e.g. `RG-DB-002`. Exactly three digits, so a typo like
 * `RG-DB-02` or `RG-DB-0002` is a compile error, not a scenario that silently never matches.
 */
export type RuleId = `RG-${RuleArea}-${Digit}${Digit}${Digit}`;
