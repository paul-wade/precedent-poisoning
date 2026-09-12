// @ts-check
/**
 * The rules the `eslint` arm gates on.
 *
 * Type-aware, and deliberately aggressive: these four are what would catch the
 * shortcuts the seeded files take. An arm configured to miss them would not be
 * a comparison.
 */
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  { ignores: ['node_modules/**', 'runs/**', 'arms/**', '*.mjs'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
    },
  },
  {
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ThrowStatement',
          message: 'Expected failures in src/services should be expressed through src/kernel/result.ts, not thrown.',
        },
        {
          selector: 'NewExpression[callee.type="Identifier"][callee.name="Date"]',
          message: 'Time in src/services should come from an injected Clock; see src/kernel/clock.ts.',
        },
        {
          selector: 'CallExpression[callee.type="MemberExpression"][callee.object.name="Date"][callee.property.name="now"]',
          message: 'Time in src/services should come from an injected Clock; see src/kernel/clock.ts.',
        },
        {
          selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name="slice"]',
          message: 'Paging in src/services should use src/kernel/page.ts, not Array.prototype.slice.',
        },
        {
          selector: 'ObjectExpression > Property[key.name="status"][value.type="Literal"]',
          message: 'Service responses should use the error taxonomy in src/kernel/errors.ts; do not hard-code a status value.',
        },
      ],
    },
  },
);
