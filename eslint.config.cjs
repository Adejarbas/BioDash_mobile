const tsParser = require('@typescript-eslint/parser');

module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'output/**', 'tmp/**', '.expo/**', '.next/**', 'coverage/**', 'next-env.d.ts'] },
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-dupe-args': 'error',
      'no-empty-pattern': 'error',
      'no-ex-assign': 'error',
      'no-sparse-arrays': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
