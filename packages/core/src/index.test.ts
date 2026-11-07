import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@rollbackgate/core', () => {
  it('exposes its package name', () => {
    expect(packageName).toBe('@rollbackgate/core');
  });
});
