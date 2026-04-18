import { defineConfig } from 'oxlint';

import baseConfig from '../../packages/oxlint-config/base.ts';

export default defineConfig({
  extends: [baseConfig],
  plugins: ['typescript', 'oxc', 'node', 'promise', 'vitest'],
  env: {
    es2024: true,
    node: true,
  },
  ignorePatterns: ['dist/**', 'worker-configuration.d.ts'],
  overrides: [
    {
      files: ['test/**/*.{ts,tsx}', 'vitest.config.mts'],
      env: {
        vitest: true,
      },
    },
  ],
});
