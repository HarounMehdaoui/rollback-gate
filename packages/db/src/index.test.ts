import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@rollbackgate/db', () => {
  it('exposes its package name', () => {
    expect(packageName).toBe('@rollbackgate/db');
  });
});
