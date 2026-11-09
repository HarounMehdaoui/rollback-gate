import type { TypeName } from 'libpg-query';

import { strings } from './names.js';

// Built-in types come qualified with pg_catalog; types in public are ours. Anything else keeps its
// schema, so it never matches a public type by accident (and becomes an unknown type change).
const implicitSchemas = new Set(['pg_catalog', 'public']);

/**
 * A type as written in `ALTER COLUMN … TYPE`, in the same spelling as the used set's native types
 * (`int4`, `varchar(50)`, `numeric(10,2)`, `Role[]`), so the type rules compare like with like.
 * `null` for a modifier that isn't a plain number: the caller marks the statement Unrecognized.
 */
export function postgresTypeName(typeName: TypeName | undefined): string | null {
  const parts = strings(typeName?.names);
  if (parts.length === 0) return null;
  const qualified = implicitSchemas.has(parts[0] ?? '') ? parts.slice(1) : parts;
  const modifiers: number[] = [];
  for (const node of typeName?.typmods ?? []) {
    // The parser omits a zero value (`TIMESTAMP(0)` → `ival: {}`), so a missing number means 0.
    const integer = 'A_Const' in node ? node.A_Const.ival : undefined;
    if (integer === undefined) return null;
    modifiers.push(integer.ival ?? 0);
  }
  const base = qualified.join('.') + (modifiers.length > 0 ? `(${modifiers.join(',')})` : '');
  return base + '[]'.repeat(typeName?.arrayBounds?.length ?? 0);
}
