import { FlatCompat } from '@eslint/eslintrc';
import prettierConfig from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
const compat = new FlatCompat({
  baseDirectory: process.cwd(),
});

export default [
  ...compat.extends('next/core-web-vitals'),
  prettierConfig,
  {
    plugins: {
      'unused-imports': unusedImports,
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      indent: [
        'error',
        2,
        {
          SwitchCase: 1,
        },
      ],
      'eol-last': ['error', 'always'],
      'max-len': [
        'warn',
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],
      semi: ['error', 'always'],
      'no-trailing-spaces': ['error'],
      'arrow-body-style': ['warn', 'as-needed'],
      'no-duplicate-imports': ['error'],
      'unused-imports/no-unused-imports': ['error'],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'react/no-unescaped-entities': 'off',
    },
  },
]; 