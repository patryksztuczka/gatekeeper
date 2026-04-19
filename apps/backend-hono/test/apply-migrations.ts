import { applyD1Migrations, env } from 'cloudflare:test';

type TestEnv = typeof env & {
  TEST_MIGRATIONS: {
    name: string;
    queries: string[];
  }[];
};

await applyD1Migrations(env.DATABASE, (env as TestEnv).TEST_MIGRATIONS);
