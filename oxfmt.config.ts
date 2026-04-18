import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 100,
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  useTabs: false,
  ignorePatterns: [
    '.turbo/**',
    'coverage/**',
    '**/dist/**',
    'apps/backend/worker-configuration.d.ts',
    'apps/backend-hono/worker-configuration.d.ts',
  ],
  overrides: [
    {
      files: [
        'apps/web/**/*.{js,jsx,ts,tsx,html,css}',
      ],
      options: {
        sortTailwindcss: {
          stylesheet:
            './apps/web/src/index.css',
          functions: [
            'cn',
            'clsx',
            'cva',
            'tw',
          ],
        },
      },
    },
  ],
});
