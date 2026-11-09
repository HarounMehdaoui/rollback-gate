import { describe, expect, it } from 'vitest';

import { dropDefaultRule } from './drop-default.js';
import { dropNotNullRule } from './drop-not-null.js';
import { setNotNullRule } from './set-not-null.js';
import { contextFrom } from './test-used-set.js';

const ctx = contextFrom(`
model Item {
  id      Int     @id @default(autoincrement())
  note    String?
  title   String
  token   String  @default(dbgenerated("gen_random_uuid()::text"))
  ref     String? @default(dbgenerated("gen_random_uuid()::text"))
  created DateTime @default(now())
  status  String  @default("draft")
  legacy  String? @ignore
}
`);
const column = (name: string) => ({ table: 'Item', column: name });

describe('RG-DB-009 set NOT NULL', () => {
  it('flags NOT NULL on a field base treats as optional as RISKY', () => {
    const [hit] = setNotNullRule.evaluate({ kind: 'SetNotNull', ...column('note') }, ctx);

    expect(hit).toMatchObject({ severity: 'RISKY', target: '"Item"."note"' });
    expect(hit?.reason).toContain('Item.note is optional');
  });

  it.each(['title', 'legacy', 'unknown'])(
    'emits no finding for %s (required, ignored or unknown)',
    (name) => {
      expect(setNotNullRule.evaluate({ kind: 'SetNotNull', ...column(name) }, ctx)).toEqual([]);
    },
  );
});

describe('RG-DB-010 drop NOT NULL', () => {
  it('flags dropping NOT NULL on a field base treats as required as RISKY', () => {
    const [hit] = dropNotNullRule.evaluate({ kind: 'DropNotNull', ...column('title') }, ctx);

    expect(hit).toMatchObject({ severity: 'RISKY', target: '"Item"."title"' });
    expect(hit?.reason).toContain('Item.title is required');
  });

  it.each(['note', 'legacy', 'unknown'])(
    'emits no finding for %s (optional, ignored or unknown)',
    (name) => {
      expect(dropNotNullRule.evaluate({ kind: 'DropNotNull', ...column(name) }, ctx)).toEqual([]);
    },
  );
});

describe('RG-DB-011 drop default', () => {
  it.each([
    ['id', 'autoincrement()'],
    ['token', 'dbgenerated("gen_random_uuid()::text")'],
  ])('flags dropping %s’s database default on a required field as UNSAFE', (name, fallback) => {
    const [hit] = dropDefaultRule.evaluate({ kind: 'DropDefault', ...column(name) }, ctx);

    expect(hit).toMatchObject({ severity: 'UNSAFE', target: `"Item"."${name}"` });
    expect(hit?.reason).toContain(`@default(${fallback})`);
  });

  it('flags dropping a database default on an optional field as RISKY', () => {
    expect(dropDefaultRule.evaluate({ kind: 'DropDefault', ...column('ref') }, ctx)).toMatchObject([
      { severity: 'RISKY', target: '"Item"."ref"' },
    ]);
  });

  // RULES.md §6 row 5: Prisma 7 sends these values itself, so the database default doesn't matter.
  it.each(['created', 'status'])(
    'emits no finding for %s, whose default Prisma sends itself',
    (name) => {
      expect(dropDefaultRule.evaluate({ kind: 'DropDefault', ...column(name) }, ctx)).toEqual([]);
    },
  );

  it.each(['note', 'legacy', 'unknown'])(
    'emits no finding for %s (no default, ignored or unknown)',
    (name) => {
      expect(dropDefaultRule.evaluate({ kind: 'DropDefault', ...column(name) }, ctx)).toEqual([]);
    },
  );
});
