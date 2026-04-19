# Password Recovery Workflow

## Goal

Complete password recovery on top of the existing Better Auth reset-email configuration so users can request a reset link, choose a new password, and regain access without support intervention.

## Scope

- provide a forgot-password entry point from sign-in,
- provide a page or route for requesting a password reset email,
- handle the reset-password callback and new-password submission,
- provide clear success and error states for invalid or expired reset links,
- ensure the flow is available to both verified and unverified users,
- add tests for the request and reset states.

## Assumptions

- Better Auth password reset email sending is already configured in the backend,
- password reset should remain available for both verified and unverified users,
- the workflow should use Better Auth reset endpoints rather than custom token infrastructure,
- password recovery is independent from organization membership resolution.

## Deliverables

- working forgot-password link from the sign-in page,
- password reset request page or form,
- password reset completion page or form,
- clear user-facing states for success, invalid token, and expired token,
- test coverage for reset request and reset completion.

## Acceptance Criteria

- A user can request a password reset email from a public page.
- A verified user can reset their password and sign in with the new password.
- An unverified user can reset their password and remain subject to email-verification rules afterward.
- A user with an invalid or expired reset link sees a clear recovery path.
- The sign-in page links to the password recovery flow.
- The completed flow does not bypass existing email-verification or session rules.

## Out of Scope

- email verification UI except where already enforced after reset,
- invitation acceptance,
- organization membership resolution,
- post-login organization choice and organization picker UI,
- passwordless authentication.

## Dependencies

- `docs/adr/002-authentication-strategy.md`
- `docs/features/11-authentication/backlog/01-setup-better-auth-foundation.md`
- `docs/features/11-authentication/backlog/04-sign-in-sign-out-and-session-model.md`
