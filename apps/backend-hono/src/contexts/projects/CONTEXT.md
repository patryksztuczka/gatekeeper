# Projects

Projects define organization-scoped governance work items. This context owns Project accountability, Project lifecycle language, and Project visibility rules.

## Language

**Project**:
An organization-scoped subject of governance work.
_Avoid_: Project profile when referring to the domain object; use project profile only for the project detail UI.

**Project Owner**:
The Organization Member accountable for a Project.
_Avoid_: Owner when the distinction from Organization owner is unclear.

**Project Slug**:
The Organization-local URL identifier for a Project.
_Avoid_: Global project ID when referring to the human-facing route identifier.

**Project Lifecycle**:
The allowed progression of a Project through creation, settings changes, archival, restoration, and retained detail access.
_Avoid_: Workflow when referring only to active vs archived lifecycle behavior.

**Archived Project**:
A Project hidden from active work without being deleted.
_Avoid_: Deleted project when the record is retained.

## Relationships

- A **Project** belongs to exactly one **Organization**.
- A **Project** is created with a name and description.
- A **Project** has a **Project Slug** unique within its **Organization**.
- A **Project** may have one **Project Owner**.
- A **Project Owner** must be an **Organization Member** of the **Project**'s **Organization**.
- A **Project** is either active or archived.
- An **Archived Project** is hidden from active work but retained.
- An **Archived Project** detail remains reachable to **Organization Members** while retained.
- **Project Lifecycle** rules govern Project creation, Project settings changes, archival, restoration, and retained detail access.
- All **Organization Members** can view their **Organization**'s active **Projects**.
- Organization owners and admins can create, edit, archive, and restore **Projects**.

## Example dialogue

> **Dev:** "When a user opens a project profile, are they viewing the **Project** itself?"
> **Domain expert:** "Yes — the profile is just the screen for a **Project**, not a separate object."
> **Dev:** "Can someone create a **Project** with only a name?"
> **Domain expert:** "No — the description is required because it explains the governance subject."
> **Dev:** "Must every **Project** have a **Project Owner**?"
> **Domain expert:** "No — a **Project Owner** is optional, but when present they must belong to the **Project**'s **Organization**."
> **Dev:** "When someone removes a **Project**, is it deleted?"
> **Domain expert:** "No — it becomes an **Archived Project** and is hidden from active work."

## Flagged ambiguities

- "project profile" was used for a product area — resolved: the domain object is **Project**; the profile is its detail UI.
- "owner" can mean either **Project Owner** or Organization owner — resolved: use **Project Owner** for project accountability and Organization owner for the access role.
- **Project Owner** was initially considered required — resolved: it is optional.
- **Project** status was initially deferred — resolved: only active vs archived is needed now; broader governance workflow statuses are not defined yet.
