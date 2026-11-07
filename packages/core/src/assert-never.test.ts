import { describe, expect, it } from 'vitest';

import { assertNever } from './assert-never.js';

describe('assertNever', () => {
  it('throws when reached at runtime with data that bypassed the types', () => {
    const fromJson: unknown = JSON.parse('{"kind":"DropSequence","name":"user_id_seq"}');

    // `as never` simulates what JSON or a cast can do: smuggle in a value the types call impossible.
    const act = () => assertNever(fromJson as never);

    expect(act).toThrow('Unhandled case: {"kind":"DropSequence","name":"user_id_seq"}');
  });

  // added: JSON.stringify throws on BigInt and returns undefined for undefined; the message must
  // still show the value instead of crashing or saying nothing.
  it('still names values that JSON.stringify cannot handle', () => {
    expect(() => assertNever(10n as never)).toThrow('Unhandled case: 10');
    expect(() => assertNever(undefined as never)).toThrow('Unhandled case: undefined');
  });
});
