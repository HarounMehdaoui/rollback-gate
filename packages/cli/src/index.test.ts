import { packageName as corePackageName } from '@rollbackgate/core';
import { packageName as dbPackageName } from '@rollbackgate/db';
import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@rollbackgate/cli', () => {
  it('exposes its package name', () => {
    expect(packageName).toBe('@rollbackgate/cli');
  });

  // Proves the workspace links and the tsc -b build order (core → db → cli) work.
  it('can import the packages it depends on', () => {
    expect([corePackageName, dbPackageName]).toEqual(['@rollbackgate/core', '@rollbackgate/db']);
  });
});
