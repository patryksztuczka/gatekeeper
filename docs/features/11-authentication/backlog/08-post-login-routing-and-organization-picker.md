# Authentication UI And Organization Access Flows

## Goal

Implement the frontend flows for the prepared v1 authentication backend so users can sign up, sign in, verify email, recover passwords, manage invites, and reach the correct organization context after login without hidden frontend auth logic.

## Scope

- build or complete the public sign-up UI for direct account creation,
- build or complete the public sign-in UI and current-session sign-out UX,
- enforce guest-only and protected-route behavior in the web app based on session state,
- provide a dedicated verify-your-email screen with resend verification action,
- handle verification success, invalid-link, and expired-link frontend states,
- provide forgot-password and reset-password UI on top of the existing backend reset flow,
- provide invite-link entry and invite acceptance UI for existing and newly created accounts,
- provide admin UI for creating organization invites in the active organization context,
- call `GET /api/auth/membership-resolution` after authentication and derive post-login routing from that response,
- show the invite-or-create choice when the user has no active organization and still has pending invites,
- show the create-organization entry path when the user has no memberships and no pending invites,
- enter the app directly when the user has an active organization,
- expose an organization picker for switching the active organization after login,
- keep pending invites visible in product UI even when the user already has an active organization,
- add frontend and integration tests for the supported auth journeys and routing states.

## Assumptions

- the authentication direction is defined by `docs/adr/002-authentication-strategy.md`,
- backend auth capabilities from backlog tasks `01` through `07` are the source of truth for auth behavior,
- Better Auth backend handlers and supporting server-side flows already exist and should be consumed rather than replaced,
- `GET /api/auth/membership-resolution` is the single source of truth for post-login organization state,
- the current session stores the active organization on `sessions.activeOrganizationId`,
- direct sign-up creates a default organization in the backend,
- invite-based sign-up creates a user account without creating a default organization,
- email verification is required before protected product access,
- users may belong to multiple organizations,
- users with multiple pending invites should see each invite as a separate selectable option ordered by the backend response.

## Deliverables

- sign-up, sign-in, and sign-out UI wired to the prepared backend auth flows,
- verify-your-email, verification callback, forgot-password, and reset-password screens,
- invite-entry and invite acceptance UI for invited users with and without an existing account,
- admin-facing invite creation UI in the product,
- post-login routing implemented from the normalized membership-resolution response,
- choice screen with `Accept pending invite` and `Create organization` actions when required,
- create-organization entry point for users with no memberships and no pending invites,
- organization picker UI for switching active organization,
- in-product pending invite visibility for users who already have organization access,
- automated test coverage for the main frontend auth and organization-access states.

## Acceptance Criteria

- A new user can complete direct sign-up from the frontend and continue into the verification flow.
- A returning user can sign in successfully from the frontend with valid credentials.
- An authenticated user is redirected away from guest-only auth pages.
- An unauthenticated user attempting to access protected routes is redirected to sign-in.
- An unverified user is blocked from protected product access and sees a dedicated verification screen with a resend option.
- A user can complete password-reset request and password-reset completion from the frontend.
- A user entering from a valid invite link can complete the invite flow from the frontend whether they already have an account or must create one first.
- An organization administrator can create an invite from the product UI for the active organization.
- A user with resolved status `active-organization` enters the app without seeing the choice or creation screens.
- A user with resolved status `needs-organization-choice` sees a choice screen with invite and create-organization actions.
- A user with resolved status `needs-organization-creation` sees the create-organization entry flow.
- A user with multiple pending invites can see and choose between each pending invite.
- A user with more than one accessible organization can switch the active organization after login.
- Pending invites remain visible in product UI even when the user already has an active organization.
- The frontend determines routing and organization-selection behavior from backend responses without re-implementing backend business rules.

## Out of Scope

- reimplementing Better Auth server behavior or replacing prepared backend auth contracts,
- changing the membership resolution rules defined in `03-organization-membership-resolution.md`,
- invitation creation or acceptance business logic beyond calling the prepared backend flows,
- default-organization creation business logic,
- role-based authorization inside the selected organization,
- MFA.

## Dependencies

- `docs/adr/002-authentication-strategy.md`
- `docs/features/11-authentication/backlog/01-setup-better-auth-foundation.md`
- `docs/features/11-authentication/backlog/03-organization-membership-resolution.md`
- `docs/features/11-authentication/backlog/04-sign-in-sign-out-and-session-model.md`
- `docs/features/11-authentication/backlog/05-email-verification-workflow.md`
- `docs/features/11-authentication/backlog/06-password-recovery-workflow.md`
- `docs/features/11-authentication/backlog/07-admin-invite-and-account-activation-flow.md`
