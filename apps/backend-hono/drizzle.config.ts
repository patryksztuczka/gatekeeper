import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default process.env.CLOUDFLARE_DATABASE_ID
  ? defineConfig({
      out: './drizzle/migrations',
      schema: './src/db/schema.ts',
      dialect: 'sqlite',
      driver: 'd1-http',
      dbCredentials: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
        token: process.env.CLOUDFLARE_D1_TOKEN!,
      },
    })
  : defineConfig({
      dialect: 'sqlite',
      out: './drizzle/migrations',
      schema: './src/db/schema.ts',
      dbCredentials: {
        url: '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/726c05b1b92043ee50f966d52ceff0a284a9090d13adcb4819abb4c245e4b304.sqlite',
      },
    });
