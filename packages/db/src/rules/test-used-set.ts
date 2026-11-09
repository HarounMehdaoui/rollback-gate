import type { RuleContext } from '@rollbackgate/core';

import { buildUsedSet } from '../prisma/used-set.js';

/** A rule context from a real base schema, so `@ignore` cases go through Prisma's own rules. */
export function contextFrom(models: string): RuleContext {
  const result = buildUsedSet(`datasource db {\n  provider = "postgresql"\n}\n${models}`);
  if (!result.ok) throw new Error(result.error);
  return { usedSet: result.usedSet };
}

export const baseSchema = `
model User {
  id     Int     @id
  name   String  @map("full_name")
  legacy String? @ignore

  @@map("users")
}

model AuditLog {
  id Int @id

  @@ignore
}
`;
