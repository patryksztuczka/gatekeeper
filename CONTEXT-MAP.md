# Context Map

Gatekeeper uses multiple domain contexts. This map is the root entrypoint for product language and context relationships.

## Contexts

- [Identity & Organization](./docs/contexts/identity-and-organization/CONTEXT.md) — defines Users, Organizations, membership, roles, invitations, and the active organization boundary. ADRs: [docs/contexts/identity-and-organization/docs/adr](./docs/contexts/identity-and-organization/docs/adr/).
- [Projects](./docs/contexts/projects/CONTEXT.md) — defines organization-scoped governance work items and Project accountability.
- [Control Library](./docs/contexts/control-library/CONTEXT.md) — defines reusable release assurance requirements, versioning, publishing, and approval policy. ADRs: [docs/contexts/control-library/docs/adr](./docs/contexts/control-library/docs/adr/).

## Relationships

- **Identity & Organization → Projects**: Identity & Organization defines the Organization and Organization Member concepts that scope Project access and Project Owner eligibility.
- **Identity & Organization → Control Library**: Identity & Organization defines the Organization, Organization Member, and Organization Role concepts used by Control Library visibility, authoring, and publishing rules.
- **Control Library → Projects**: Control Library defines reusable Controls and Release Impact; Projects may later consume Controls when release assurance work is applied to Projects.
- **Projects ↔ Control Library**: Archived Projects and Archived Controls are hidden from active work but retained; do not describe retained archived records as deleted.
