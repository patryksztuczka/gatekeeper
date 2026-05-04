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

Copy `.env.example` to `.env` and fill in local Worker runtime values plus Cloudflare values for Drizzle tooling.

Wrangler loads local Worker variables from `.env` when no `.dev.vars` file is present.

```txt
pnpm db:generate
pnpm db:migrate
```

Update `wrangler.jsonc` with the real D1 `database_id` after creating the database.

## Better Auth runtime config

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `TRUSTED_ORIGINS`
- `CORS_ORIGIN`
- `MAIL_FROM_EMAIL`
- `MAIL_FROM_NAME`
- `MAILPIT_URL`

## Local Mailpit

Start Mailpit locally from the repository root:

```txt
docker compose up -d mailpit
```

Mailpit UI:

```txt
http://localhost:8025
```

Better Auth emails sent during local development will be delivered to Mailpit through its HTTP API.

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>();
```
