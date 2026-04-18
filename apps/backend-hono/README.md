```txt
pnpm install
pnpm dev
```

```txt
pnpm deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
pnpm cf-typegen
```

## D1 and Drizzle

Copy `.env.example` to `.env` and fill in your Cloudflare values for Drizzle tooling.

```txt
pnpm db:generate
pnpm db:migrate
```

Update `wrangler.jsonc` with the real D1 `database_id` after creating the database.

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>();
```
