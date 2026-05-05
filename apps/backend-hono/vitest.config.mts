import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

const migrationsPath = path.join(import.meta.dirname, 'drizzle', 'migrations');
const migrations = await readD1Migrations(migrationsPath);

export default defineWorkersConfig({
  test: {
    setupFiles: ['test/apply-migrations.ts'],
    testTimeout: 15_000,
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            BETTER_AUTH_SECRET: 'test-secret-123456789012345678901234567890',
            BETTER_AUTH_URL: 'http://localhost:8787',
            TRUSTED_ORIGINS: 'http://localhost:3000',
            TEST_MIGRATIONS: migrations,
          },
          d1Databases: ['DATABASE'],
        },
      },
    },
  },
});
