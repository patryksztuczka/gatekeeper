# ADR 001: Database and Data Access

## Status

Accepted

## Context

Gatekeeper needs a persistence decision before authentication and other backend features can be implemented.

The project already targets Cloudflare Workers through `apps/backend-hono`, so the database and access approach should fit that runtime and keep the first version simple to operate.

Authentication, organizations, memberships, invites, and sessions all require relational storage with a migration workflow and a typed access layer.

## Decision

### Database

Use Cloudflare D1 as the primary database for v1.

### Data access layer

Use Drizzle as the schema, query, and migration layer.

### Migration source of truth

Use Drizzle migrations as the source of truth for database schema changes.

### Database ownership

Store authentication data and application data in the same D1 database in v1 unless a later scaling or compliance need requires separation.

### Application integration

Application code should access the database through a centralized backend database module rather than scattering raw SQL or ad hoc connection logic across handlers.

### Platform direction

This decision optimizes for Cloudflare Workers as the primary backend platform in v1.

## Consequences

This decision enables:

- Better Auth integration on top of a defined persistence layer,
- typed schema management with Drizzle,
- a consistent migration workflow,
- a low-operations v1 deployment model,
- a shared relational model for users, organizations, memberships, invites, and sessions.

This decision also implies:

- stronger Cloudflare platform coupling in v1,
- SQLite-style D1 constraints and behavior rather than PostgreSQL semantics,
- the need to validate Better Auth compatibility with the selected D1 and Drizzle setup during implementation.

## Remaining Details

The main persistence direction is resolved.

The remaining implementation details are:

1. the exact Drizzle project layout and config location,
2. the local development workflow for D1 migrations and seed data,
3. the exact Better Auth adapter or integration pattern for D1 and Drizzle,
4. whether any auth-related tables should be isolated logically within the schema naming conventions.
