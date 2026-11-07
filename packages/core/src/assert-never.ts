/**
 * Put this in the `default` of a switch over a union. It only compiles if every case is handled.
 *
 * It still throws at runtime: bad data (JSON, a cast) can get past the types, and we'd rather fail
 * loudly than guess.
 *
 * @throws Error showing the unexpected value.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${describe(value)}`);
}

function describe(value: unknown): string {
  try {
    // stringify gives undefined for undefined, and throws on BigInt or circular objects.
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
