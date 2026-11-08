// @ts-check
import { builtinModules } from 'node:module';

import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Pure packages (ARCHITECTURE.md §2 and §10): no I/O, no environment, no clock, no randomness.
const purePackages = ['packages/core/**', 'packages/db/**', 'packages/config/**'];

const pureMessage =
  'Pure package: no I/O. Load data in packages/cli and pass it in (ARCHITECTURE.md §2).';

// Every Node built-in, with and without the "node:" prefix (some exist only with the prefix).
const nodeBuiltins = [...new Set(builtinModules.map((name) => name.replace(/^node:/, '')))];
const builtinImportBans = nodeBuiltins.flatMap((name) => [
  { name, message: pureMessage },
  { name: `node:${name}`, message: pureMessage },
]);

export default defineConfig(
  // Hidden folders at the root hold tool configuration, not project code.
  globalIgnores(['**/dist/', '**/dist-test/', '**/coverage/', 'spikes/', '.*/']),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // CONVENTIONS.md: a non-null `!` needs a comment saying why it is safe, so it needs an
      // eslint-disable line that carries that comment.
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Named exports only (CONVENTIONS.md).' },
      ],
    },
  },

  // Tool config files must use a default export, and the .js ones aren't type-checked.
  {
    files: ['eslint.config.js', 'vitest.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },

  // Purity: globals and properties that read the outside world.
  {
    files: purePackages,
    rules: {
      'no-restricted-globals': [
        'error',
        ...['process', 'Date', 'fetch', 'setTimeout', 'setInterval', 'setImmediate'].map(
          (name) => ({
            name,
            message: pureMessage,
          }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: pureMessage },
      ],
    },
  },

  // Dependency direction (ARCHITECTURE.md §2): cli → db | config → core. One complete
  // no-restricted-imports setting per group, because a later setting replaces an earlier one.
  {
    files: ['packages/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinImportBans,
          patterns: [
            { regex: '^@rollbackgate/', message: 'core depends on nothing else in the workspace.' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/db/**', 'packages/config/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinImportBans,
          patterns: [
            {
              regex: '^@rollbackgate/(?!core$)',
              message: 'Pure analyzers may import only @rollbackgate/core.',
            },
          ],
        },
      ],
    },
  },

  // Turns off stylistic rules that would fight Prettier. Must stay last.
  prettier,
);
