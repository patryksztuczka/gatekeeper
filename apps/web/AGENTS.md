# Web Intent Node

## Purpose And Scope

`apps/web` is the Gatekeeper frontend: a Vite React SPA with React Router, TanStack Query, tRPC client, Better Auth client, Tailwind, and shadcn-style UI primitives.

This node covers React pages, routing, API consumption, mutation patterns, and UI conventions. For API behavior, also read `../backend-hono/AGENTS.md`.

## Entry Points And Contracts

- `src/App.tsx` wraps the router with app providers.
- `src/providers/router.tsx` owns route registration.
- `src/lib/trpc.ts` owns the singleton `QueryClient` and tRPC client.
- `src/features/auth/api/auth-client.ts` owns the Better Auth React client and backend base URL.
- `src/features/auth/api/auth-api.ts` contains existing REST helpers that have not moved to tRPC yet.
- Feature folders use `api/`, `schemas/`, `routing/`, `components/`, `pages/`, and `tests/` as needed.
- `src/features/*/pages/*` contains route-level pages owned by each feature.

## Current API Pattern

- Organization membership resolution and member lists use `trpc.organizations.*`.
- Invitation entry state uses `trpc.organizations.invitationEntryState`.
- Project list/detail/settings pages use `trpc.projects.*` with TanStack Query.
- Better Auth flows stay on Better Auth client/helpers, not tRPC.
- Control pages use `trpc.controls.*`; Better Auth-owned actions still use REST helpers where Better Auth owns the endpoint.
- Browser cookies should flow with `credentials: 'include'`; do not manually read or set Better Auth cookies.

## Invariants And Pitfalls

- Use TanStack Query mutation callbacks (`onSuccess`, `onError`) for mutation side effects. Avoid local `try/catch` around `mutateAsync` when callbacks can handle the flow.
- Keep query invalidation near mutation success handling.
- Preserve domain copy: Project, Project Owner, Archived Project, Organization, Control, Control Publish Request.
- Keep UI aligned with existing components and Tailwind/shadcn-style conventions unless explicitly asked to redesign.
- Avoid `useMemo`/`useCallback` by default; follow the existing React Compiler-friendly style.

## Type And React Rules

- Prefer inferred function return types. Do not add explicit function return annotations unless necessary.
- Use `SyntheticEvent<HTMLFormElement>` for form submit handlers.
- Keep imported backend types portable. Do not import backend modules that pull Cloudflare Worker bindings into the web TypeScript program.

## Validation

- Typecheck: `pnpm --filter web check-types`
- Tests: `pnpm --filter web test`
- Build: `pnpm --filter web build`
- Format check: `pnpm --filter web format:check`
