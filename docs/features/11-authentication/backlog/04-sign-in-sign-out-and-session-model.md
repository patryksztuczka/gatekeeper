# Sign-In, Sign-Out, And Session Model

## Goal

Complete and harden Gatekeeper's existing sign-in, sign-out, and session handling so the current Better Auth foundation is covered by explicit tests and product-ready route behavior.

## Scope

- validate the existing email-and-password sign-in flow,
- validate the existing sign-out flow,
- confirm protected and guest-only routing behavior against session state,
- verify the configured v1 session model in application behavior and tests,
- add any minimal implementation changes needed to align current behavior with `docs/adr/002-authentication-strategy.md`.

## Assumptions

- Better Auth is already integrated as the authentication foundation,
- email and password sign-in is already wired in the backend and web app,
- the current sign-in and sign-out UI exists and should be hardened rather than redesigned,
- v1 session duration is 7 days,
- remember me is out of scope for v1,
- multi-device sessions are allowed in v1,
- logout should affect only the current session.

## Deliverables

- coverage for successful sign-in and failed sign-in states,
- coverage for logout behavior on the current session,
- coverage for guest-only and protected route redirects,
- explicit verification that unverified users cannot enter protected product routes,
- any minimal fixes needed to keep the implementation aligned with the ADR.

## Acceptance Criteria

- A user with valid credentials can sign in successfully.
- A user with invalid credentials receives a clear error and no session is created.
- An unverified user cannot access the protected product after sign-in.
- Guest-only routes redirect authenticated users away from sign-in and sign-up pages.
- Protected routes redirect unauthenticated users to sign-in.
- Signing out clears only the current session.
- The implementation does not introduce remember-me behavior.
- The resulting behavior remains compatible with multiple concurrent sessions on different devices.

## Out of Scope

- email verification UI and resend flow,
- password recovery UI and reset flow,
- invitation creation or acceptance,
- organization membership resolution,
- post-login organization choice and organization picker UI,
- RBAC.

## Dependencies

- `docs/adr/002-authentication-strategy.md`
- `docs/features/11-authentication/backlog/01-setup-better-auth-foundation.md`
