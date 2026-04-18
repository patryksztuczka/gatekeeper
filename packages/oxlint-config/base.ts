import { defineConfig } from 'oxlint';

export default defineConfig({
  rules: {
    'no-alert': 'error',
    'no-debugger': 'error',
  },
  overrides: [
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      rules: {
        'no-unused-vars': 'off',
        'typescript/no-unused-vars': 'error',
      },
    },
  ],
});
