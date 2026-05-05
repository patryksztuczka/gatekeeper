# Audit Log emission

Gatekeeper records v1 Audit Events from product services at domain mutation boundaries, and audited domain mutations commit their Audit Events atomically with the domain change when possible.

On D1, that atomic write uses the platform-supported batch mechanism rather than explicit `BEGIN` transactions; transport handlers and database triggers are not the v1 source of audit history because they either miss alternate execution paths or lack actor context and domain deltas.
