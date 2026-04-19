# Admin Invite And Account Activation Flow

## Goal

Allow organization administrators to invite users into an organization and let invited users activate their account context, accept the invitation, and gain access to the invited organization immediately.

## Scope

- provide an authenticated admin flow for creating organization invites,
- support invite-link entry into the product,
- support invited users who already have an account,
- support invited users who must create an account before accepting,
- ensure invite-based sign-up does not create a default organization,
- ensure accepting an invite creates membership and activates the invited organization in the current session,
- handle invalid, expired, already accepted, and cancelled invite links,
- add tests for invite issuance and acceptance states.

## Assumptions

- Better Auth organization invitations are already available in the backend foundation,
- invite-based sign-up creates a user account without creating a default organization,
- accepting an invite should grant access to the invited organization immediately in the current session,
- backend membership resolution rules are defined in `03-organization-membership-resolution.md`,
- post-login routing screens outside the invite-entry path are handled by `08-post-login-routing-and-organization-picker.md`.

## Deliverables

- admin-facing invite creation flow,
- invite-link validation and entry handling,
- account activation path for invited users who need to sign up,
- acceptance path for invited users who already have an account,
- backend updates so invite acceptance activates the invited organization in the current session,
- tests for valid, invalid, expired, and accepted invite cases.

## Acceptance Criteria

- An organization administrator can create an invite for an email address in the active organization context.
- A user who signs up from an invite-linked journey does not get a default organization created automatically.
- A user with an existing account can accept a valid invite and gain membership in the invited organization.
- A newly created invited account can verify, sign in, and accept the invite without creating a default organization.
- Accepting a valid invite switches the current session to the invited organization immediately.
- Invalid, expired, already accepted, and cancelled invite links are handled with clear user-facing outcomes.
- The resulting flow does not require the frontend to re-derive invitation state from hidden backend rules.

## Out of Scope

- post-login organization choice screen for users entering outside an invite link,
- organization picker UI,
- role-based authorization beyond assigning the invited membership role,
- invitation email copy polish beyond functional delivery,
- non-email invitation channels.

## Dependencies

- `docs/adr/002-authentication-strategy.md`
- `docs/features/11-authentication/backlog/03-organization-membership-resolution.md`
- `docs/features/11-authentication/backlog/05-email-verification-workflow.md`
