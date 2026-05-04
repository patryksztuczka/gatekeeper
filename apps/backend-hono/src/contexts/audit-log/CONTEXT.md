# Audit Log

Audit Log defines immutable records of governance-relevant actions across Gatekeeper contexts. It owns audit event language, accountability boundaries, and retained audit visibility.

## Language

**Audit Log**:
The retained collection of Audit Events for an Organization.
_Avoid_: Application log, debug log

**Audit Event**:
An immutable Organization-scoped record that a User, Organization Member, or system process attempted or completed a governance-relevant action.
_Avoid_: Log entry when precision matters

**Failed Audit Event**:
An Audit Event for a blocked security-sensitive or accountability-sensitive action.
_Avoid_: Validation error, application error

**Governance-Relevant Action**:
An action that changes retained governance records, accountability assignments, approvals, evidence, access, membership, or sensitive exports.
_Avoid_: Page view, routine read

**Audit Actor**:
The User, Organization Member, or system process responsible for an Audit Event.
_Avoid_: Owner, account

**Event-Time Label**:
A short human-readable actor or target label retained on an Audit Event as it appeared when the event occurred.
_Avoid_: Current display name when historical meaning matters

**Audit Delta**:
A targeted field-level description of meaningful audited changes on an Audit Event.
_Avoid_: Full object snapshot

**Audit Correction**:
An Audit Event that explains or supersedes an earlier Audit Event without modifying it.
_Avoid_: Editing audit history

**Audit Log Viewer**:
An Organization owner or admin allowed to view the Organization's Audit Log.
_Avoid_: Any Organization Member

**Audit Action**:
A stable domain action name recorded on an Audit Event.
_Avoid_: Route name, table name, CRUD verb

**Audit Target**:
The primary domain record an Audit Event is about.
_Avoid_: Multiple primary targets

**Audit Reason**:
A human-entered justification retained on an Audit Event for selected decision-heavy or destructive actions.
_Avoid_: Generic note

## Relationships

- An **Audit Log** belongs to exactly one **Organization**.
- An **Audit Log** contains many **Audit Events**.
- An **Audit Event** belongs to exactly one **Organization**.
- V1 **Audit Events** are Organization-scoped only.
- Non-Organization authentication and security events are deferred from the v1 **Audit Log**.
- An **Audit Event** identifies the **Audit Actor** when the actor is known.
- An **Audit Event** has one primary **Audit Target**.
- An **Audit Event** may include related record references when the action touches more than the primary **Audit Target**.
- An **Audit Event** may include an **Audit Reason**.
- Specific domain services decide when an **Audit Reason** is required.
- An **Audit Actor** may be a **User**, an **Organization Member**, or a system process.
- For Organization-scoped actions, the **Organization Member** is the primary **Audit Actor**.
- An **Audit Event** also retains the **User** behind the **Organization Member** when known.
- An **Audit Event** may be caused by a system process rather than a **User** or **Organization Member**.
- An **Audit Event** keeps foreign keys for traceability and **Event-Time Labels** for historical readability.
- **Event-Time Labels** are not the source of truth for current actor or target state.
- An **Audit Event** may include **Audit Deltas** for meaningful field-level changes.
- **Audit Deltas** should not contain full object snapshots, secrets, or incidental implementation fields.
- An **Audit Event** is immutable after creation during normal product behavior.
- An **Audit Event** is not deleted through normal product behavior.
- An **Audit Correction** may refer to an earlier **Audit Event** without modifying the earlier event.
- Formal retention periods, legal deletion behavior, and compliance export policy are deferred from v1.
- An **Audit Log Viewer** can view Audit Events for their Organization.
- Organization Members who are not Organization owners or admins cannot view the full **Audit Log** by default.
- **Audit Log Viewer** access is Organization-level and does not depend on current target visibility.
- Links from **Audit Events** back to target records follow the target context's own retained access rules.
- An **Audit Action** uses stable domain language rather than route names, table names, or generic CRUD verbs.
- An **Audit Action** uses a dotted naming convention such as `project.archived` or `organization_access.denied`.
- Product services produce **Audit Events** from domain mutation boundaries.
- Transport handlers should not be the sole source of **Audit Events** for domain mutations.
- Database triggers should not produce **Audit Events** in v1.
- Audited domain mutations and their **Audit Events** commit in the same transaction when possible.
- If an **Audit Event** cannot be recorded for an audited domain mutation, the domain mutation should not commit.
- An **Audit Event** records completed **Governance-Relevant Actions** and blocked security-sensitive or accountability-sensitive attempts.
- Routine validation failures are not **Audit Events**.
- Ordinary page views and routine detail reads are not **Audit Events**.
- Sensitive downloads and exports are **Governance-Relevant Actions**.
- Projects, Control Library, Checklists, and Identity & Organization may produce **Audit Events** for governance-relevant actions.

## Example dialogue

> **Dev:** "Is this just another application log line?"
> **Domain expert:** "No — an **Audit Event** is a retained accountability record for an **Organization**, not a debugging message."
> **Dev:** "Should every failed form submission create a **Failed Audit Event**?"
> **Domain expert:** "No — only blocked security-sensitive or accountability-sensitive attempts belong in the **Audit Log**."
> **Dev:** "Do we audit every Project detail view?"
> **Domain expert:** "No — ordinary reads are not **Governance-Relevant Actions**, but sensitive downloads and exports are."
> **Dev:** "If a User belongs to two Organizations, who archived the Project?"
> **Domain expert:** "The **Audit Actor** is the **Organization Member** acting in that **Organization**, with the underlying **User** retained when known."
> **Dev:** "If a Project is renamed after archival, what should the old **Audit Event** display?"
> **Domain expert:** "It should keep an **Event-Time Label** so the event remains understandable as it happened."
> **Dev:** "Should `project.updated` store the entire Project before and after the change?"
> **Domain expert:** "No — use **Audit Deltas** for meaningful changed fields, not full object snapshots."
> **Dev:** "What if an **Audit Event** was misleading?"
> **Domain expert:** "Create an **Audit Correction**; do not edit the earlier **Audit Event**."
> **Dev:** "Are **Audit Events** retained forever?"
> **Domain expert:** "V1 retains them through normal product behavior, but formal retention periods and legal deletion policy are deferred."
> **Dev:** "Can every Organization Member browse the **Audit Log**?"
> **Domain expert:** "No — only an **Audit Log Viewer** can view the full **Audit Log** by default."
> **Dev:** "Can an **Audit Log Viewer** see events for an Archived Project?"
> **Domain expert:** "Yes — **Audit Log** access is Organization-level; opening the Project link still follows Project retained access rules."
> **Dev:** "Should the event action be `PATCH /api/trpc/projects.update`?"
> **Domain expert:** "No — use an **Audit Action** like `project.updated` so the record keeps domain meaning."
> **Dev:** "Should the tRPC procedure create the **Audit Event**?"
> **Domain expert:** "The service that performs the domain mutation should create it, so every path to the same action is audited consistently."
> **Dev:** "Do failed sign-ins belong in the v1 **Audit Log**?"
> **Domain expert:** "No — v1 **Audit Events** are Organization-scoped only; non-Organization authentication and security events are deferred."
> **Dev:** "Can a Project be archived if the `project.archived` **Audit Event** fails to insert?"
> **Domain expert:** "No — audited domain mutations and their **Audit Events** commit together."
> **Dev:** "If completing a Checklist Item also relates to a Project and Control Version, how many targets does the **Audit Event** have?"
> **Domain expert:** "One primary **Audit Target**, with related references for the Project and Control Version."
> **Dev:** "Should rejecting a Control Publish Request include a reason?"
> **Domain expert:** "Yes — selected decision-heavy actions should require an **Audit Reason**."

## Flagged ambiguities

- "log entry" can mean either a debugging/application log line or an **Audit Event** — resolved: use **Audit Event** for retained accountability records.
- "failure" can mean either a routine validation error or a blocked sensitive action — resolved: only blocked security-sensitive or accountability-sensitive attempts are **Failed Audit Events**.
- "governance-relevant" was too broad — resolved: it covers retained record changes, accountability assignments, approvals, evidence, access, membership, sensitive downloads, and exports, but not ordinary page views or routine reads.
- "actor" can mean either the authenticating **User** or their Organization-scoped membership — resolved: for Organization-scoped actions, the **Organization Member** is the primary **Audit Actor**, with the **User** retained when known.
- "display name" can mean the current name or the name at the time of the event — resolved: use **Event-Time Label** for historical audit readability.
- "before/after" can imply full row snapshots — resolved: use **Audit Deltas** for meaningful audited fields only.
- "correcting the audit log" can imply editing history — resolved: use an **Audit Correction** that refers to the earlier **Audit Event**.
- "retained" can imply a formal retention duration — resolved: v1 retains **Audit Events** through normal product behavior, while formal retention and legal deletion policy are deferred.
- "activity feed" can sound visible to every member — resolved: the full **Audit Log** is visible only to **Audit Log Viewers** by default.
- "target access" can be confused with **Audit Log** access — resolved: **Audit Log Viewer** access is Organization-level, while target links follow the target context's rules.
- "action" can mean a route, table write, or domain behavior — resolved: use **Audit Action** names in stable domain language.
- "where audit happens" can mean transport, service, or database — resolved: product services produce **Audit Events** from domain mutation boundaries in v1.
- "security event" can include events outside an **Organization** — resolved: non-Organization authentication and security events are deferred from the v1 **Audit Log**.
- "best-effort audit" would allow missing records for audited actions — resolved: audited domain mutations and their **Audit Events** commit in the same transaction when possible.
- "target" can imply every related record is equally primary — resolved: an **Audit Event** has one primary **Audit Target** and may include related references.
- "reason" can become a generic note field — resolved: **Audit Reason** is a human-entered justification for selected decision-heavy or destructive actions.
