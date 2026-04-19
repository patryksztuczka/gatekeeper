# Post-Login Routing And Organization Picker

## Goal

Use backend membership resolution to route authenticated users to the correct next step after login and provide an organization picker for users who can access more than one organization.

## Scope

- call `GET /api/auth/membership-resolution` after authentication,
- route authenticated users according to the resolved membership status,
- show the invite-or-create choice when the user has no active organization and still has pending invites,
- show create-organization entry when the user has no memberships and no pending invites,
- enter the app directly when the user has an active organization,
- expose an organization picker for switching active organization after login,
- keep pending invites visible in product UI even when the user already has an active organization,
- add tests for the frontend routing decisions and organization switching behavior.

## Assumptions

- backend membership resolution is defined by `03-organization-membership-resolution.md`,
- `GET /api/auth/membership-resolution` is the single source of truth for post-login state,
- organization switching happens after login through an organization picker,
- the current session stores the active organization on `sessions.activeOrganizationId`,
- users may belong to multiple organizations,
- users with multiple pending invites should see each invite as a separate selectable option ordered by soonest expiry.

## Deliverables

- frontend integration with the membership-resolution endpoint,
- post-login routing decisions derived from a single normalized backend response,
- choice screen with `Accept pending invite` and `Create organization` paths when required,
- create-organization entry point when no memberships or pending invites exist,
- organization picker UI for switching the active organization after login,
- in-product pending invite visibility for users who already have active organization access,
- test coverage for the post-login routing states.

## Acceptance Criteria

- A user with resolved status `active-organization` enters the app without seeing the choice or creation screens.
- A user with resolved status `needs-organization-choice` sees a choice screen with invite and create-organization actions.
- A user with resolved status `needs-organization-creation` sees the create-organization entry flow.
- A user with multiple pending invites can see and choose between each pending invite.
- A user with more than one accessible organization can switch the active organization after login.
- Pending invites remain visible in product UI even when the user already has an active organization.
- The frontend determines routing from the membership-resolution response without re-implementing backend business rules.

## Out of Scope

- backend membership resolution rules,
- invitation creation,
- invitation acceptance business logic,
- default-organization creation implementation,
- role-based authorization inside the selected organization.

## Dependencies

- `docs/adr/002-authentication-strategy.md`
- `docs/features/11-authentication/backlog/03-organization-membership-resolution.md`
- `docs/features/11-authentication/backlog/07-admin-invite-and-account-activation-flow.md`
