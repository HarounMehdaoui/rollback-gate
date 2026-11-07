/**
 * Marks a branch that must be unreachable, typically the `default` of a `switch` over every `Change`
 * kind. If a kind is added and a switch doesn't handle it, this call stops type-checking.
 *
 * It still throws at runtime, because data from outside the type system (JSON, a cast) can carry a
 * value the types say is impossible. Failing loudly there is the fail-closed choice.
 *
 * @throws Error naming the unexpected value.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${describe(value)}`);
}

function describe(value: unknown): string {
  try {
    // JSON.stringify returns undefined for undefined/functions/symbols; fall back to String().
    return JSON.stringify(value) ?? String(value);
  } catch {
    // Circular structures and BigInt make JSON.stringify throw; the error must still be readable.
    return String(value);
  }
}
