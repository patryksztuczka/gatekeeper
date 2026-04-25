# Gatekeeper

Gatekeeper helps organizations manage governance work around projects, controls, checklists, exceptions, and audit evidence.

## Language

**Project**:
An organization-scoped subject of governance work.
_Avoid_: Project profile when referring to the domain object; use project profile only for the project detail UI.

**Project Owner**:
The organization member accountable for a Project.
_Avoid_: Owner when the distinction from Organization owner is unclear.

**Archived Project**:
A Project hidden from active work without being deleted.
_Avoid_: Deleted project when the record is retained.

## Relationships

- A **Project** belongs to exactly one **Organization**.
- A **Project** is created with a name and description.
- A **Project** may have one **Project Owner**.
- A **Project Owner** must be a member of the **Project**'s **Organization**.
- A **Project** is either active or archived.
- All members of an **Organization** can view its **Projects**.
- **Organization** owners and admins can create, edit, archive, and restore **Projects**.

## Example dialogue

> **Dev:** "When a user opens a project profile, are they viewing the **Project** itself?"
> **Domain expert:** "Yes — the profile is just the screen for a **Project**, not a separate object."
> **Dev:** "Can someone create a **Project** with only a name?"
> **Domain expert:** "No — the description is required because it explains the governance subject."
> **Dev:** "Is the **Project Owner** the same as an **Organization** owner?"
> **Domain expert:** "No — the **Project Owner** is accountable for one **Project**; an **Organization** owner is an access role."
> **Dev:** "Must every **Project** have a **Project Owner**?"
> **Domain expert:** "No — a **Project Owner** is optional, but when present they must belong to the **Project**'s **Organization**."
> **Dev:** "When someone removes a **Project**, is it deleted?"
> **Domain expert:** "No — it becomes an **Archived Project** and is hidden from active work."
> **Dev:** "Can every member of an **Organization** create a **Project**?"
> **Domain expert:** "No — every member can view **Projects**, but only owners and admins can create, edit, archive, and restore them."

## Flagged ambiguities

- "project profile" was used for the next product area — resolved: the domain object is **Project**; the profile is its detail UI.
- "owner" can mean either **Project Owner** or **Organization** owner — resolved: use **Project Owner** for project accountability and Organization owner for the access role.
- **Project Owner** was initially considered required — resolved: it is optional.
- **Project** status was initially deferred — resolved: only active vs archived is needed now; broader governance workflow statuses are not defined yet.
