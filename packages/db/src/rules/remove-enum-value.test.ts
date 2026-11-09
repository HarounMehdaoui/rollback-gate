import { describe, expect, it } from 'vitest';

import { removeEnumValueRule } from './remove-enum-value.js';
import { contextFrom } from './test-used-set.js';

const ctx = contextFrom(
  'enum Role {\n  USER\n  GUEST\n}\nmodel U {\n  id Int @id\n  role Role\n}\n',
);

describe('RG-DB-016 enum value removed', () => {
  it('flags a value removed from a used enum as RISKY', () => {
    expect(
      removeEnumValueRule.evaluate(
        { kind: 'RemoveEnumValue', enumName: 'Role', value: 'GUEST' },
        ctx,
      ),
    ).toEqual([
      {
        severity: 'RISKY',
        target: `"Role".'GUEST'`,
        reason: `Base writes that use 'GUEST' fail with "invalid input value for enum Role".`,
        fix: 'Stop writing the value in one release, and remove it one release later.',
      },
    ]);
  });

  it('emits no finding for an enum base does not use', () => {
    expect(
      removeEnumValueRule.evaluate({ kind: 'RemoveEnumValue', enumName: 'Other', value: 'X' }, ctx),
    ).toEqual([]);
  });
});
