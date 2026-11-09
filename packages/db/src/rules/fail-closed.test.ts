import type { RuleContext } from '@rollbackgate/core';
import { describe, expect, it } from 'vitest';

import { editedMigrationRule } from './edited-migration.js';
import { unparsableSqlRule } from './unparsable-sql.js';
import { unrecognizedStatementRule } from './unrecognized-statement.js';

// These rules don't depend on what base uses: not understanding a change is a finding by itself.
const ctx: RuleContext = {
  usedSet: { tables: new Map(), enums: new Map(), uniqueIndexes: new Map() },
};

describe('RG-DB-020 edited or removed migration', () => {
  it.each(['modified', 'removed'] as const)('flags a %s applied migration as UNSAFE', (edit) => {
    const [hit] = editedMigrationRule.evaluate(
      { kind: 'EditedMigration', migration: '1_init', edit },
      ctx,
    );

    expect(hit).toMatchObject({ severity: 'UNSAFE', target: '1_init' });
    expect(hit?.reason).toContain(`is ${edit} in this release`);
  });
});

describe('RG-DB-021 unparsable SQL', () => {
  it('flags it as UNSAFE and quotes the parser error', () => {
    const [hit] = unparsableSqlRule.evaluate(
      {
        kind: 'Unparsable',
        sql: 'DROPP TABLE x;',
        error: 'syntax error at or near "DROPP" at offset 0',
      },
      ctx,
    );

    expect(hit).toMatchObject({ severity: 'UNSAFE', target: 'migration.sql' });
    expect(hit?.reason).toContain('syntax error at or near "DROPP" at offset 0');
  });
});

describe('RG-DB-022 unrecognized statement', () => {
  it('flags it as RISKY, never SAFE, with the statement as target', () => {
    expect(
      unrecognizedStatementRule.evaluate(
        { kind: 'Unrecognized', sql: 'CREATE EXTENSION "pgcrypto"' },
        ctx,
      ),
    ).toEqual([
      {
        severity: 'RISKY',
        target: 'CREATE EXTENSION "pgcrypto"',
        reason:
          "Rollback Gate understands this statement's syntax but doesn't model its effect on base.",
        fix: 'Check the statement by hand. If it is common, open an issue to add a normalizer.',
      },
    ]);
  });

  it('keeps a long or multi-line statement to one readable line', () => {
    const sql = `DO $$\nBEGIN\n  ${'PERFORM 1; '.repeat(20)}\nEND $$`;

    const [hit] = unrecognizedStatementRule.evaluate({ kind: 'Unrecognized', sql }, ctx);

    expect(hit?.target).toHaveLength(80);
    expect(hit?.target).toMatch(/^DO \$\$ BEGIN PERFORM 1;.*…$/);
  });
});
