const path = require('path');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: false,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: [path.join(__dirname, 'tsconfig.json')],
    tsconfigRootDir: __dirname,
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  env: {
    es2021: true,
    node: true,
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  settings: {
    'import/resolver': {
      typescript: {
        project: path.join(__dirname, 'tsconfig.json'),
      },
    },
  },
  rules: {
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
  },
};
