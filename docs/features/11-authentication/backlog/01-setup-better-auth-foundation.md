# Setup Better Auth Foundation

## Goal

Set up Better Auth as the authentication foundation for Gatekeeper so later tasks can build signup, login, email verification, password recovery, invitations, and organization-aware routing on top of a stable base.

## Scope

- install and initialize Better Auth in the application,
- enable email and password authentication,
- configure the v1 session policy,
- wire the base auth server integration and request handling,
- define the required environment configuration for auth,
- prepare the persistence layer required by Better Auth,
- expose the auth foundation in a way that later tasks can extend without replacing it.

## Assumptions

- the persistence decision record is `docs/adr/001-database-and-data-access.md`,
- the authentication decision record is `docs/adr/002-authentication-strategy.md`,
- v1 authentication uses Better Auth,
- v1 supports email and password only,
- session duration is 7 days,
- remember me is out of scope,
- multi-device sessions are allowed,
- logout only affects the current session,
- full session revocation is out of scope for MVP.

## Deliverables

- Better Auth dependency added and configured,
- base auth configuration committed in the codebase,
- session settings aligned with the ADR,
- auth environment variables documented in the project,
- auth entry points or handlers wired into the application,
- minimal verification that the auth foundation boots correctly.

## Acceptance Criteria

- Better Auth is integrated into the application and starts successfully.
- Email and password authentication is enabled in the configuration.
- Session duration is configured to 7 days.
- The implementation does not introduce remember-me behavior.
- The implementation permits multiple concurrent sessions on different devices.
- Logout is implemented or configured only for the current session.
- The resulting foundation is ready for follow-up tasks for signup, verification, recovery, and invitation flows.

## Out of Scope

- signup UI,
- sign-in UI,
- email verification workflow,
- password recovery workflow,
- invitation acceptance,
- organization picker or post-login routing,
- RBAC,
- MFA,
- notification provider integration and email template design.

## Dependencies

- `docs/adr/001-database-and-data-access.md`
- `docs/adr/002-authentication-strategy.md`
