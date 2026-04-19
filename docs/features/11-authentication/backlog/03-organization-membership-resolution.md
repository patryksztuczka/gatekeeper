# Organization Membership Resolution

## Goal

Resolve a signed-in user's organization access into a single backend contract so Gatekeeper can determine whether the user should enter an active organization, choose between pending invites and organization creation, or create a default organization.

## Scope

- define the backend rules for resolving organization memberships after authentication,
- expose a dedicated authenticated endpoint for membership resolution,
- initialize the current session `activeOrganizationId` from the resolved memberships when needed,
- preserve a valid session `activeOrganizationId` when the user still has access to that organization,
- update the current session `activeOrganizationId` immediately after invite acceptance,
- return enough data for post-login routing and organization-picker UI without pushing business rules into the frontend.

## Assumptions

- the authentication decision record is `docs/adr/002-authentication-strategy.md`,
- session state stores the current organization on `sessions.activeOrganizationId`,
- direct signup creates a default organization,
- invite-based signup does not create a default organization,
- users may belong to multiple organizations,
- accepting an invite should grant access to the invited organization immediately in the current session,
- UI rendering and routing screens are handled by `08-post-login-routing-and-organization-picker.md`.

## Resolution Rules

1. Membership resolution runs for an authenticated user and inspects the current session, the user's memberships, and the user's pending invitations.
2. If the current session already has an `activeOrganizationId` and the user still has membership in that organization, keep it unchanged.
3. If the current session `activeOrganizationId` is missing or no longer valid, resolve a fallback active organization from the user's memberships.
4. The fallback active organization for v1 should be the earliest membership by `members.createdAt` ascending, with `organizationId` ascending as the tie-breaker.
5. If the user has at least one membership after resolution, return `active-organization`.
6. If the user has no memberships and at least one pending, unexpired invite, return `needs-organization-choice`.
7. If the user has no memberships and no pending, unexpired invites, return `needs-organization-creation`.
8. Pending invites should be included in the response even when the user already has an active organization so the product can surface them in UI.
9. Expired invites and invites in non-pending states must not affect resolution.
10. When a user accepts an invite, the invite flow must create the membership, mark the invitation accepted, and set the current session `activeOrganizationId` to the invited organization before returning success.

## API Contract

Expose a dedicated authenticated endpoint:

- `GET /api/auth/membership-resolution`

The endpoint should return a single normalized payload:

```ts
type MembershipResolutionStatus =
  | 'active-organization'
  | 'needs-organization-choice'
  | 'needs-organization-creation';

type MembershipResolutionResponse = {
  status: MembershipResolutionStatus;
  activeOrganizationId: string | null;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
  pendingInvites: Array<{
    id: string;
    organizationId: string;
    organizationName: string;
    role: string | null;
    expiresAt: string;
  }>;
  canCreateOrganization: boolean;
};
```

Response rules:

- `status = 'active-organization'` when `activeOrganizationId` is resolved,
- `status = 'needs-organization-choice'` when `activeOrganizationId` is `null` and `pendingInvites.length > 0`,
- `status = 'needs-organization-creation'` when `activeOrganizationId` is `null` and `pendingInvites.length === 0`,
- `organizations` must include every organization the user can enter,
- `organizations` should be ordered with the active organization first when one exists, otherwise by membership resolution order,
- `pendingInvites` must contain only pending, unexpired invites and should be ordered by `expiresAt` ascending, then `createdAt` ascending,
- `canCreateOrganization` should be `true` for v1.

## Deliverables

- membership resolution service or handler implemented in the backend,
- `GET /api/auth/membership-resolution` exposed for authenticated clients,
- session initialization updated to use the documented fallback rule,
- invite acceptance updated to activate the invited organization in the current session,
- tests covering the resolution states and session updates.

## Acceptance Criteria

- An authenticated user with a valid session `activeOrganizationId` for one of their memberships keeps that organization active.
- An authenticated user with memberships but no valid session `activeOrganizationId` receives `active-organization` and the session is updated to the fallback organization.
- The fallback organization is chosen deterministically from membership order defined in this document.
- An authenticated user with no memberships and at least one pending, unexpired invite receives `needs-organization-choice`.
- An authenticated user with no memberships and no pending, unexpired invites receives `needs-organization-creation`.
- Pending invites are returned even when the user already has an active organization.
- Expired invites do not affect the resolved status.
- Accepting an invite gives the user immediate access to that organization in the current session.
- The frontend can determine the post-login route from one membership-resolution response without recomputing backend business rules.

## Out of Scope

- invite-link entry UI,
- invite acceptance screen layout,
- post-login choice screen UI,
- organization picker UI,
- organization creation UI,
- role-based authorization inside the active organization,
- cross-session active-organization preferences beyond the current session.

## Dependencies

- `docs/adr/002-authentication-strategy.md`
- `docs/features/11-authentication/backlog/01-setup-better-auth-foundation.md`
- `docs/features/11-authentication/backlog/07-admin-invite-and-account-activation-flow.md`
- `docs/features/11-authentication/backlog/08-post-login-routing-and-organization-picker.md`
