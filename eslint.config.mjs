import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const directory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: directory });
// A config object containing only `ignores` applies globally; combined with
// `rules` it would only scope that object and .next output would be linted.
const config = [{
  ignores: ['.next/**', 'node_modules/**', 'coverage/**'],
}, ...compat.extends('next/core-web-vitals'), {
  rules: { '@next/next/no-html-link-for-pages': 'off' },
}];

export default config;
