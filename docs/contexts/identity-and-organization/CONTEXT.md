# Identity & Organization

Identity & Organization defines who can enter Gatekeeper and which Organization they are operating within. It owns organization membership, organization roles, invitations, and the active organization boundary used by other contexts.

## Language

**User**:
A person who can authenticate to Gatekeeper.
_Avoid_: Account when referring to the person rather than their membership or Organization.

**Organization**:
A group that contains members and owns governance work in Gatekeeper.
_Avoid_: Tenant or account when referring to the organization boundary.

**Organization Member**:
A User who belongs to an Organization.
_Avoid_: User when the membership relationship matters.

**Organization Role**:
A User's access level within an Organization.
_Avoid_: Access role when the scope is specifically Organization membership.

**Organization Invitation**:
An invitation for a User to join an Organization.
_Avoid_: Invite when precision matters.

**Active Organization**:
The Organization an authenticated User is currently operating within.
_Avoid_: Current account, tenant.

## Relationships

- A **User** may belong to many **Organizations**.
- An **Organization** has many **Organization Members**.
- An **Organization Member** has one **Organization Role** within that **Organization**.
- Initial **Organization Role** values are owner, admin, and member.
- A direct signup creates a **User** and a default **Organization**.
- An invite-based signup creates a **User** without creating a default **Organization**.
- An **Organization Invitation** lets a **User** join an **Organization**.
- A **User** may have multiple pending **Organization Invitations**.
- Product access is blocked until the **User** completes email verification.
- The **Active Organization** determines which Organization-scoped work the **User** is operating within.

## Example dialogue

> **Dev:** "When someone signs up from an **Organization Invitation**, do we create a default **Organization** for them?"
> **Domain expert:** "No — invite-based signup creates the **User** and lets them join the invited **Organization**."
> **Dev:** "Is an Organization owner the same as a **Project Owner**?"
> **Domain expert:** "No — owner is an **Organization Role** value; **Project Owner** is accountability for one Project."
> **Dev:** "If a **User** belongs to two **Organizations**, which one do they see after login?"
> **Domain expert:** "They enter the app through their **Active Organization** or choose one when no active organization can be resolved."

## Flagged ambiguities

- "account" can mean either **User** or **Organization** — resolved: use **User** for the person and **Organization** for the group boundary.
- "owner" can mean either an owner **Organization Role** or **Project Owner** — resolved: use Organization owner for the access role and **Project Owner** for project accountability.
- "invite" can be too generic — resolved: use **Organization Invitation** for invitations to join an Organization.
