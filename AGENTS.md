# Gatekeeper Intent Node

## Purpose And Scope

Gatekeeper helps organizations manage governance work around Projects, Controls, checklists, exceptions, and audit evidence.

This root node covers repo-wide language, boundaries, and navigation. Load app-specific nodes before editing app code.

## Semantic Boundaries

- Backend product/API work lives in `apps/backend-hono`. Read `apps/backend-hono/AGENTS.md` before changing Hono routes, Better Auth integration, Drizzle schema, D1 queries, tRPC procedures, or domain services.
- Frontend product/UI work lives in `apps/web`. Read `apps/web/AGENTS.md` before changing React pages, TanStack Query usage, tRPC client calls, Better Auth client flows, routing, or UI components.
- Shared product language is discovered through `CONTEXT-MAP.md`; system-wide decisions live in `docs/adr/`, and context-specific decisions live beside their context files. Check these before renaming domain concepts or changing boundaries.

## Global Domain Invariants

- Use **Project** for the organization-scoped governance work item.
- Use **Project Owner** for the member accountable for a Project. Avoid ambiguous "owner" when it could mean Organization owner.
- Archived Projects and Archived Controls are hidden from active work but retained. Do not describe archived retained records as deleted.
- Use **Control Library**, **Control**, **Control Code**, **Control Version**, **Control Metadata**, **Release Impact**, and **Control Publish Request** consistently.
- Better Auth owns `/api/auth/*`; Gatekeeper product APIs should not be added under Better Auth routes.

## Global Engineering Rules

- Prefer TypeScript inference. Do not add explicit function return types unless needed for a concrete reason.
- Keep business rules in domain/service modules. Transport layers should authenticate, authorize, validate transport input, call services, and translate errors.
- Keep changes minimal and localized. Avoid compatibility layers unless persisted data, shipped behavior, external consumers, or an explicit requirement needs them.
- Preserve domain terminology in UI copy, tests, API responses, and route names.
- Use `SyntheticEvent<HTMLFormElement>` for React form submit handlers, not deprecated `FormEvent`.

## Downlinks

- Backend intent node: `apps/backend-hono/AGENTS.md`
- Web intent node: `apps/web/AGENTS.md`

## Validation Entry Points

- Whole repo: `pnpm lint`, `pnpm check-types`, `pnpm test`
- Backend scoped checks: `pnpm --filter backend-hono check-types`, `pnpm --filter backend-hono test`, `pnpm --filter backend-hono build`
- Web scoped checks: `pnpm --filter web check-types`, `pnpm --filter web test`, `pnpm --filter web build`
