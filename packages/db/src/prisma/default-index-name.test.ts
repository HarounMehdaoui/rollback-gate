import { describe, expect, it } from 'vitest';

import { defaultIndexName } from './default-index-name.js';

describe('defaultIndexName', () => {
  it('names a unique index <table>_<column>_key', () => {
    expect(defaultIndexName('users', ['email'], 'unique')).toBe('users_email_key');
  });

  it('joins the columns of a compound unique index in order', () => {
    expect(defaultIndexName('users', ['full_name', 'role'], 'unique')).toBe(
      'users_full_name_role_key',
    );
  });

  it('names a primary key <table>_pkey, without the columns', () => {
    expect(defaultIndexName('Post', ['id'], 'primaryKey')).toBe('Post_pkey');
  });

  // Prisma 7.10.1's own DDL for this table (ADR-0004): the stem is cut, the suffix is kept.
  it('cuts the name so it still fits in 63 characters with the suffix', () => {
    const name = defaultIndexName(
      'AVeryLongModelNameForTestingIdentifierLimits',
      ['anotherQuiteLongColumnNameThatGoesOnAndOn'],
      'unique',
    );

    expect(name).toBe('AVeryLongModelNameForTestingIdentifierLimits_anotherQuiteLo_key');
    expect(name).toHaveLength(63);
  });

  it('cuts a long primary key name the same way', () => {
    expect(defaultIndexName('t'.repeat(70), ['id'], 'primaryKey')).toBe(`${'t'.repeat(58)}_pkey`);
  });
});
