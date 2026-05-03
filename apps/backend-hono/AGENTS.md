# Backend Intent Node

## Purpose And Scope

`apps/backend-hono` is the Gatekeeper backend: a Hono Cloudflare Worker with Better Auth, Drizzle, D1, and tRPC.

This node covers backend routes, auth integration, persistence, product services, and API transport. For frontend consumers, also read `../web/AGENTS.md`.

## Entry Points And Contracts

- `src/index.ts` wires Hono middleware, the tRPC mount, the Better Auth handler, and health response. Keep it thin.
- `src/lib/auth.ts` configures Better Auth. Better Auth owns `/api/auth/*`.
- `src/db/schema.ts` defines persisted D1 tables through Drizzle.
- `src/lib/*` modules own domain/business rules.
- `src/schemas/*` modules own reusable Zod transport schemas by domain.
- `src/trpc/*` owns tRPC transport. Product tRPC is mounted at `/api/trpc/*`.
- `src/trpc/router.ts` composes product tRPC routers and exports the `AppRouter` type consumed by the web app.

## Current Product APIs

- Organization membership resolution and member lists use `src/trpc/organizations-router.ts`.
- Invitation entry state uses `src/trpc/organizations-router.ts`.
- Project tRPC procedures live in `src/trpc/projects-router.ts`.
- Project business logic lives in `src/lib/projects.ts`: membership lookup, Project Owner validation, Project create/update/archive/restore rules.
- Control tRPC procedures live in `src/trpc/controls-router.ts`.

## Invariants And Pitfalls

- Route handlers and tRPC procedures must not own business rules; they should delegate to `src/lib/*`.
- Keep Better Auth endpoints out of tRPC. Use `auth.api.getSession({ headers })` in product API context when auth is needed.
- Organization membership is the authorization boundary for Project and Control access.
- Project Owner must be an Organization member.
- Archived records are retained and may remain reachable where the domain requires it.
- If frontend imports backend tRPC types, keep `src/trpc/router.ts` and its imports typecheck-safe for the web TypeScript program.

## Type Rules

- Prefer inferred function return types. Avoid `Promise<...>`, `boolean`, `string`, or DTO return annotations on functions unless inference fails or an external contract explicitly needs it.
- Keep parameter/input types where they constrain domain inputs.
- If tests or consumers need an exported response type, prefer deriving it from an inferred function return type.
- Delete types that become unused after removing explicit annotations.

## Validation

- Typecheck: `pnpm --filter backend-hono check-types`
- Tests: `pnpm --filter backend-hono test`
- Build dry run: `pnpm --filter backend-hono build`
- Format check: `pnpm --filter backend-hono format:check`
