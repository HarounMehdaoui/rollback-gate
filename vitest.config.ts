import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Source tests only: tsc -b also compiles tests into dist/, and those copies must not run twice.
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
  },
});
