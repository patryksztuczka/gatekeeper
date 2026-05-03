# ADR 003: Organization-Scoped App Routes

## Status

Accepted

## Context

Gatekeeper Projects are scoped to Organizations, and Project slugs are unique within an Organization rather than globally unique. The app also has public authentication and invitation routes that must remain accessible without an organization slug.

## Decision

Authenticated app pages use organization-scoped routes under `/:organizationSlug/*`, while public authentication, invitation, email verification, and password reset routes remain top-level.

Organization slugs reserve top-level public route names such as `sign-in`, `sign-up`, `invite`, `verify-email`, and `reset-password` so public routes remain unambiguous.

Project pages use `/:organizationSlug/projects` for the Projects list and `/:organizationSlug/p/:projectSlug` for Project detail. The `/p` segment keeps Project detail URLs compact while avoiding collisions with organization-level pages such as settings, audit, controls, checklists, exceptions, and projects.

Project API calls also take the organization slug explicitly, and validate membership and role against that Organization rather than relying only on the session's active organization.

When an authenticated user visits `/`, the app resolves their organization membership and redirects to their active organization route when possible; otherwise it shows the existing organization choice or creation flow.

## Consequences

The URL determines organization context for authenticated app pages, so visiting an organization URL should align the session's active organization with the URL when the user is a member.

Organization switching preserves known static organization pages when possible and redirects dynamic entity pages, such as Project detail, to the new organization's home route.
