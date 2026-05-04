# Context Map

Gatekeeper uses multiple domain contexts. This map is the root entrypoint for product language and context relationships.

## Contexts

- [Identity & Organization](./apps/backend-hono/src/contexts/identity-organization/CONTEXT.md) — defines Users, Organizations, membership, roles, invitations, and the active organization boundary. ADRs: [apps/backend-hono/src/contexts/identity-organization/docs/adr](./apps/backend-hono/src/contexts/identity-organization/docs/adr/).
- [Projects](./apps/backend-hono/src/contexts/projects/CONTEXT.md) — defines organization-scoped governance work items and Project accountability.
- [Control Library](./apps/backend-hono/src/contexts/control-library/CONTEXT.md) — defines reusable release assurance requirements, versioning, publishing, and approval policy. ADRs: [apps/backend-hono/src/contexts/control-library/docs/adr](./apps/backend-hono/src/contexts/control-library/docs/adr/).
- [Checklists](./apps/backend-hono/src/contexts/checklists/CONTEXT.md) — defines reusable Checklist Templates, Project Checklists, Checklist Items, and Project-specific Control completion. ADRs: [apps/backend-hono/src/contexts/checklists/docs/adr](./apps/backend-hono/src/contexts/checklists/docs/adr/).

## Relationships

- **Identity & Organization → Projects**: Identity & Organization defines the Organization and Organization Member concepts that scope Project access and Project Owner eligibility.
- **Identity & Organization → Control Library**: Identity & Organization defines the Organization, Organization Member, and Organization Role concepts used by Control Library visibility, authoring, and publishing rules.
- **Control Library → Projects**: Control Library defines reusable Controls; Projects may later consume Controls when release assurance work is applied to Projects.
- **Projects ↔ Control Library**: Archived Projects and Archived Controls are hidden from active work but retained; do not describe retained archived records as deleted.
- **Checklists → Projects**: Checklists attach Project Checklists to Projects; a Project can have zero or many Project Checklists.
- **Checklists → Control Library**: Checklists use active Controls from the Control Library and preserve the Control Version captured for each Checklist Item.
