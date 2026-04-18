import { defineConfig } from 'oxlint';

import baseConfig from '../../packages/oxlint-config/base.ts';

export default defineConfig({
  extends: [baseConfig],
  plugins: ['typescript', 'oxc', 'react'],
  env: {
    browser: true,
    es2024: true,
  },
  ignorePatterns: ['dist/**'],
  settings: {
    react: {
      version: '19.2.0',
    },
  },
});
