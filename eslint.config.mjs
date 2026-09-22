import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const directory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: directory });
const config = [...compat.extends('next/core-web-vitals'), {
  ignores: ['.next/**', 'node_modules/**', 'coverage/**'],
  rules: { '@next/next/no-html-link-for-pages': 'off' },
}];

export default config;
