# Audit Log emission

Gatekeeper records v1 Audit Events from product services at domain mutation boundaries, and audited domain mutations commit their Audit Events in the same database transaction when possible.

This keeps Audit Events tied to domain meaning and prevents governance-relevant changes from committing without their accountability record; transport handlers and database triggers are not the v1 source of audit history because they either miss alternate execution paths or lack actor context and domain deltas.
