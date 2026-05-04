# ADR 0001: Authentication Strategy

_Moved from global ADR 002._

## Status

Accepted

## Context

Gatekeeper needs a clear v1 authentication direction before implementation tasks are written for signup, login, verification, password recovery, invitations, and post-login routing.

This record captures the agreed decisions so implementation work can proceed without reopening the core product direction.

## Assumptions

- authentication should be based on Better Auth,
- the first supported user authentication method should be email and password,
- password recovery is required,
- email verification is required,
- direct signup should create a user and a default organization,
- invite-based signup should create a user account without creating a default organization,
- users may belong to multiple organizations,
- access to the product should be blocked until email verification is completed,
- password reset should be available to both verified and unverified users,
- session duration for v1 should be 7 days,
- remember me is out of scope for v1,
- multi-device sessions are allowed in v1,
- session revocation is out of scope for v1 except for logging out the current session,
- organization switching is required in v1 through a post-login organization switcher,
- MFA is out of scope for v1.

## Decision

### Authentication foundation

Use Better Auth as the authentication framework for Gatekeeper.

### Initial login method

Support email and password for the first release.

### Signup model

Direct signup creates a user and a default organization.

Invite-based signup creates a user account without creating a default organization.

Users can later belong to multiple organizations.

### Invite and onboarding routing

Invite acceptance should take priority over default-organization creation when a user enters through an invite link.

The v1 routing rules should be:

- if the user enters from a valid invite link, show the organization invite acceptance screen,
- if the user logs in normally and already has an active organization, enter the app,
- if the user logs in normally, has no active organization, and has pending invites, show a choice screen with `Accept pending invite` and `Create organization`,
- if the user logs in normally, has no active organization, and has no pending invites, show `Create default organization`.

Pending invites should remain visible in product UI even when the user does not enter through an invite link.

### Email verification

Email verification is required before product access.

### Password recovery

Users must be able to recover access through a password reset flow.

Password reset should be available for both verified and unverified accounts.

### Session model

The v1 session model should be:

- 7-day session duration,
- no remember me,
- multi-device sessions allowed,
- logout supports the current session only,
- full session revocation is out of scope for MVP,
- organization switching happens after login through an organization switcher.

### Boundaries

Authentication is responsible for:

- identifying the actor,
- authenticating the actor,
- establishing the session,
- determining which organizations the actor can enter after authentication.

Authentication is not responsible for:

- role-based authorization inside an organization,
- notification delivery implementation,
- service identity design,
- MFA in v1.

## Consequences

This decision unblocks implementation work for:

- account and identity model,
- sign-in and session flow design,
- email verification workflow,
- password recovery workflow,
- organization membership resolution after authentication,
- admin and user invitation flows,
- first-login and post-login routing,
- Better Auth integration.

## Remaining Details

The main strategy assumptions are resolved.

The remaining items are implementation details for follow-up tasks:

1. Should password reset for unverified users also include a resend verification path or verification reminder?
2. Should the organization switcher default to the last active organization on each new session?
3. How should multiple pending invites be presented on the post-login choice screen?
