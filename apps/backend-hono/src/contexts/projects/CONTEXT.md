# Projects

Projects define organization-scoped governance work items. This context owns Project accountability, Project lifecycle language, and Project visibility rules.

## Language

**Project**:
An organization-scoped subject of governance work.
_Avoid_: Project profile when referring to the domain object; use project profile only for the project detail UI.

**Project Owner**:
The Organization Member accountable for a Project.
_Avoid_: Owner when the distinction from Organization owner is unclear.

**Project Assignment**:
The relationship that makes an Organization Member a participant in a Project.
_Avoid_: Project Owner when referring only to Project participation or visibility; invitation when no notification flow is meant.

**Project Assignment Role**:
The Project-scoped role held by a Project Assignment.
_Avoid_: Organization Role when the role is scoped only to one Project.

**Project Contributor**:
The Project Assignment Role for an assigned Organization Member who participates in a Project without Project Owner accountability.
_Avoid_: Project Member when distinguishing the role from general Organization membership.

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
- A **Project** may have many **Project Assignments**.
- A **Project Assignment** belongs to exactly one **Project** and one **Organization Member**.
- Any current **Organization Member** can hold a **Project Assignment** regardless of **Organization Role**.
- A **Project Assignment** has one **Project Assignment Role**.
- A **Project** can have at most one **Project Assignment** for the same **Organization Member**.
- Removing an **Organization Member** removes their **Project Assignments**.
- Initial **Project Assignment Role** values are Project Owner and Project Contributor.
- Stored **Project Assignment Role** values are `project_owner` and `project_contributor`.
- A **Project** may have at most one Project Owner **Project Assignment**.
- A **Project Owner** is the **Project Assignment** whose **Project Assignment Role** is Project Owner.
- Assigning a new **Project Owner** changes the previous **Project Owner** assignment to Project Contributor unless that assignment is explicitly removed.
- Removing the last Project Owner **Project Assignment** is allowed.
- A **Project** may be created without **Project Assignments**.
- A **Project** without **Project Assignments** is visible only to Organization owners and admins.
- A **Project** is either active or archived.
- An **Archived Project** is hidden from active work but retained.
- An **Archived Project** detail remains reachable to assigned **Organization Members** and Organization owners/admins while retained.
- **Archived Projects** are hidden from regular active **Project** lists.
- Archived **Project** lists return all Archived Projects in the Organization for Organization owners/admins and assigned Archived Projects for other **Organization Members**.
- **Project Assignments** cannot be created, removed, or changed while the **Project** is archived.
- **Project Lifecycle** rules govern Project creation, Project settings changes, archival, restoration, and retained detail access.
- Default **Project** lists return all Projects in the Organization for Organization owners/admins and assigned Projects for other **Organization Members**.
- **Project** lists show the current **Project Owner** but not the full **Project Assignment** roster.
- The current **Project Owner** is visible to everyone who can view the **Project**.
- Assigned **Organization Members** can view their assigned active **Projects**.
- Organization owners and admins can view the full **Project Assignment** roster in **Project** settings.
- Contributors do not view the full **Project Assignment** roster in **Project** settings for MVP.
- Direct **Project** detail access follows the same visibility rule as **Project** lists.
- Removing a **Project Assignment** immediately removes current **Project** visibility for that **Organization Member** unless they are an Organization owner/admin.
- Organization owners and admins can view, create, edit, archive, and restore all **Projects** in their **Organization**.
- Organization owners and admins may also hold **Project Assignments** when they participate in or own a **Project**.
- Organization owners and admins can create, remove, and change **Project Assignments**.
- **Project Assignment** management is a separate Project settings action from editing Project name and description.
- **Project Assignment** management uses explicit create, role change, and remove actions rather than bulk roster replacement.
- **Project Assignments** do not grant Control Library authoring, publishing, or template-management permissions.
- **Project Assignments** do not grant **Audit Log** viewer access.
- Creating a **Project Assignment** does not send a notification or invitation for MVP.
- Creating, removing, and changing **Project Assignments** are governance-relevant actions that produce **Audit Events**.
- Project Assignment **Audit Actions** are `project_assignment.created`, `project_assignment.role_changed`, and `project_assignment.removed`.
- Project Assignment **Audit Events** do not require an **Audit Reason** for MVP.
- **Project** creation produces its own **Audit Event** separately from later **Project Assignment** changes.
- If **Project** creation later accepts initial **Project Assignments**, the **Project** creation and each **Project Assignment** creation produce separate **Audit Events** in the same transaction.

## Example dialogue

> **Dev:** "When a user opens a project profile, are they viewing the **Project** itself?"
> **Domain expert:** "Yes — the profile is just the screen for a **Project**, not a separate object."
> **Dev:** "Can someone create a **Project** with only a name?"
> **Domain expert:** "No — the description is required because it explains the governance subject."
> **Dev:** "Must every **Project** have a **Project Owner**?"
> **Domain expert:** "No — a **Project Owner** assignment is optional, but a **Project** can have at most one."
> **Dev:** "Can a **Project** be created before anyone is assigned?"
> **Domain expert:** "Yes — Organization owners and admins can create an unassigned **Project**, and regular members will not see it until assigned."
> **Dev:** "Can regular **Organization Members** see every **Project** in their **Organization**?"
> **Domain expert:** "No — they see active **Projects** they are assigned to, while Organization owners and admins can see all **Projects**."
> **Dev:** "Can a **Project Owner** assign new Contributors?"
> **Domain expert:** "No — Organization owners and admins manage **Project Assignments**."
> **Dev:** "Do **Project Assignment** changes belong in the **Audit Log**?"
> **Domain expert:** "Yes — they change access and Project accountability, so they produce **Audit Events**."
> **Dev:** "When someone removes a **Project**, is it deleted?"
> **Domain expert:** "No — it becomes an **Archived Project** and is hidden from active work."

## Flagged ambiguities

- "project profile" was used for a product area — resolved: the domain object is **Project**; the profile is its detail UI.
- "owner" can mean either **Project Owner** or Organization owner — resolved: use **Project Owner** for project accountability and Organization owner for the access role.
- **Project Owner** was initially considered required — resolved: it is optional.
- **Project** status was initially deferred — resolved: only active vs archived is needed now; broader governance workflow statuses are not defined yet.
- **Project Owner** could have been stored separately from **Project Assignment** — resolved: **Project Owner** is the **Project Assignment** with the Project Owner **Project Assignment Role**.
- "Project Member" could blur Project assignment with **Organization Member** — resolved: use **Project Contributor** for assigned participants without Project Owner accountability.
