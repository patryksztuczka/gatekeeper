# Email Verification Workflow

## Goal

Complete the email verification workflow on top of the existing Better Auth configuration so newly registered users can verify their email address and reach product access without manual intervention.

## Scope

- keep email verification required before product access,
- handle the verification callback from Better Auth,
- provide a dedicated verify-your-email screen for users blocked on verification,
- provide product UI for verification success, invalid links, and expired links,
- provide a resend verification action for users who have not yet verified their email,
- support verification flow for both direct sign-up and invite-based sign-up accounts,
- add tests for the end-to-end verification states.

## Assumptions

- Better Auth email verification is already enabled in the backend configuration,
- sign-up already sends a verification email,
- unverified users must be blocked from product access,
- invite-based sign-up still requires email verification before product access,
- the verification workflow should build on Better Auth endpoints rather than replace them with custom token handling.

## Deliverables

- verification callback page or route in the web app,
- dedicated verify-your-email screen with resend action,
- resend verification action exposed in the web app,
- clear user-facing states for success, invalid token, and expired token,
- coverage for verified and unverified sign-in outcomes,
- documentation or code comments only where needed to explain non-obvious flow handling.

## Acceptance Criteria

- A newly created account receives a verification email through the configured backend flow.
- A user can complete verification from the email link without manual database changes.
- A verified user can continue into the normal sign-in and post-login flow.
- An unverified user is blocked from protected product access.
- An unverified user is redirected to a dedicated verification screen instead of remaining only on inline sign-in feedback.
- A user with an expired or invalid verification link sees a clear recovery path.
- A user who has not yet verified their email can request another verification email.
- The workflow works for both direct sign-up and invite-based sign-up accounts.

## Out of Scope

- password recovery,
- invitation acceptance UI,
- organization membership resolution,
- post-login organization choice and organization picker UI,
- email template copy polish beyond functional delivery.

## Dependencies

- `docs/adr/002-authentication-strategy.md`
- `docs/features/11-authentication/backlog/01-setup-better-auth-foundation.md`
- `docs/features/11-authentication/backlog/04-sign-in-sign-out-and-session-model.md`
