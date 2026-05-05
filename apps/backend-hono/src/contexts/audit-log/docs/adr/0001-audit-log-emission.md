# Audit Log emission

Gatekeeper records v1 Audit Events from product services at domain mutation boundaries, and audited domain mutations commit their Audit Events atomically with the domain change when possible.

On D1, that atomic write uses the platform-supported batch mechanism rather than explicit `BEGIN` transactions; transport handlers and database triggers are not the v1 source of audit history because they either miss alternate execution paths or lack actor context and domain deltas.

V1 Audit Events are emitted for major Organization-scoped governance mutations in Projects, the Control Library, and Checklists. Event actions use stable domain names such as `project.updated`, `control_publish_request.approved`, and `checklist_item.refreshed`; they are not route names or table names.

The Audit Log read API is intentionally small for v1: owners and admins can list their Organization's Audit Events with optional `action`, `targetType`, and `targetId` filters plus bounded `limit` and `offset` pagination. Cursor pagination, date filters, exports, and formal retention behavior are deferred.
