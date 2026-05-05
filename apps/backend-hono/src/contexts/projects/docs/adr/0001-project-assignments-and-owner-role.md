# ADR 0001: Project Assignments and Owner Role

## Status

Accepted

## Context

Projects originally stored Project Owner as a nullable member reference, and all Organization Members could view all Projects. Gatekeeper now needs Project visibility to be limited to assigned participants while preserving Project Owner as a special accountability role.

## Decision

Model Project participation with Project Assignments. A Project Assignment belongs to one Project and one Organization Member and has a Project Assignment Role. Initial roles are Project Owner and Project Contributor, stored as `project_owner` and `project_contributor`.

Project Owner is not stored as a separate Project field; it is the Project Assignment whose role is Project Owner. A Project can have at most one Project Owner assignment and at most one assignment for the same Organization Member. Projects may still be created without assignments, in which case only Organization owners and admins can see and manage them until assignments are added.

Organization owners and admins can see and manage all Projects and Project Assignments in their Organization regardless of assignment. Assigned Contributors can view their assigned Projects and the Project Assignment roster, but Project Assignment does not grant Project management, checklist management, or Control Library permissions.

Project Assignment changes are governance-relevant actions. Creating, removing, or changing Project Assignments must produce Audit Events because these changes affect access and Project accountability. Stable audit actions are `project_assignment.created`, `project_assignment.role_changed`, and `project_assignment.removed`.

## Consequences

This keeps Project Owner and Project Contributor in one participation model, avoids duplicate owner state, and makes member visibility depend on Project Assignment. Changing the Project Owner becomes a role transition: assigning a new Project Owner demotes the previous Project Owner assignment to Project Contributor unless it is explicitly removed.

Existing `projects.project_owner_member_id` values should be migrated into Project Assignments with the Project Owner role. Projects without an existing Project Owner remain unassigned. Because Gatekeeper is still in development, the old `project_owner_member_id` field should be removed in the same implementation rather than kept as compatibility state.
