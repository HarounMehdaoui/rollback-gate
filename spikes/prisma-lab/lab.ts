// Runs one runtime experiment with the real Prisma client and prints the result or the exact error.
// Usage: node lab.ts <experiment>. Setup (odd data written "by head") is done with psql beforehand.
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.ts';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: 'postgresql://postgres:lab@127.0.0.1:55432/lab' }),
});

const experiments: Record<string, () => Promise<unknown>> = {
  // E5: which columns does Prisma send when the defaulted fields are left out?
  e5: () => prisma.item.create({ data: { small: 1, label: 'e5', email: 'e5@lab' } }),
  // E9: is the enum parameter cast with the type's name?
  e9: () => prisma.item.findMany({ where: { role: 'ADMIN' }, select: { id: true } }),
  // E6: does upsert use ON CONFLICT? (run once with the unique index, once after dropping it)
  e6: () =>
    prisma.item.upsert({
      where: { email: 'e6@lab' },
      create: { small: 6, label: 'e6', email: 'e6@lab' },
      update: { label: 'e6-updated' },
    }),
  // E3: a bigint above 2^31 in a column the client thinks is Int.
  e3: () => prisma.item.findUnique({ where: { email: process.env.EMAIL ?? 'e3@lab' }, select: { small: true } }),
  // E4: NULL in a column the client thinks is required.
  e4: () => prisma.item.findUnique({ where: { email: 'e4@lab' }, select: { label: true } }),
  // E7: an enum value the client doesn't know.
  e7: () => prisma.item.findUnique({ where: { email: 'e7@lab' }, select: { role: true } }),
};

const name = process.argv[2] ?? '';
const run = experiments[name];
if (!run) {
  throw new Error(`unknown experiment ${name}`);
}

try {
  const result = await run();
  console.log(`${name} OK:`, JSON.stringify(result, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v)));
} catch (error) {
  const e = error as { name?: string; code?: string; message?: string };
  console.log(`${name} ERROR: ${e.name ?? ''} ${e.code ?? ''}\n${e.message ?? String(error)}`);
} finally {
  await prisma.$disconnect();
}
