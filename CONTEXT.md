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

**Control Library**:
The organization-scoped collection of reusable Controls.
_Avoid_: Checklist template when referring to the source collection of Controls.

**Control**:
A reusable release assurance requirement that can be applied to Projects.
_Avoid_: Check when referring to the reusable requirement definition.

**Control Code**:
An organization-managed human-readable identifier for a Control.
_Avoid_: Database ID when referring to the policy-facing identifier.

**Control Version**:
An immutable revision of a Control's meaning used to preserve historical release decisions.
_Avoid_: Revision when referring to audit-preserved Control meaning.

**Control Metadata**:
Editable administrative information about a Control that does not change its release assurance meaning.
_Avoid_: Control Version when referring to non-audit administrative details.

**Archived Control**:
A Control hidden from new use without removing its Control Versions or historical usages.
_Avoid_: Deleted control when the record is retained.

**Draft Control**:
A Control being prepared before it is available for templates or checklists.
_Avoid_: Active control when the Control is not yet published.

**Release Impact**:
The effect an unsatisfied Control has on a Project's release decision.
_Avoid_: Severity when referring to release decision behavior.

**Accepted Evidence Type**:
A category of proof that can satisfy or support a Control evaluation.
_Avoid_: Attachment type when referring to the policy expectation rather than a stored file.

**Control Approval Policy**:
An Organization setting that governs whether Control publish actions require approval.
_Avoid_: Release approval when referring to publishing Controls or Control updates.

**Control Publish Request**:
A reviewable submission to publish a new Control or a policy-meaning update to an active Control.
_Avoid_: Release approval request when referring to Control publishing.

## Relationships

- A **Project** belongs to exactly one **Organization**.
- A **Project** is created with a name and description.
- A **Project** may have one **Project Owner**.
- A **Project Owner** must be a member of the **Project**'s **Organization**.
- A **Project** is either active or archived.
- All members of an **Organization** can view its **Projects**.
- **Organization** owners and admins can create, edit, archive, and restore **Projects**.
- An **Organization** has exactly one **Control Library**.
- A **Control Library** belongs to exactly one **Organization**.
- A **Control Library** contains many **Controls**.
- All members of an **Organization** can view active **Controls** in its **Control Library**.
- All members of an **Organization** can create draft **Controls** and proposed **Control** updates.
- Draft **Controls** and proposed **Control** updates are visible to their author and to **Organization** owners and admins.
- **Organization** owners and admins can view archived **Controls**.
- **Organization** owners and admins can create, edit, archive, and restore **Controls**.
- Only **Organization** owners and admins can publish **Controls** and **Control** updates.
- A **Control Code** is unique across active and archived **Controls** within an **Organization**.
- A **Control** is created with a Control Code, title, business meaning, verification method, accepted evidence types, applicability conditions, and release impact.
- A **Draft Control** can be saved with only a Control Code and title.
- A **Draft Control** must have business meaning, verification method, accepted evidence types, applicability conditions, and Release Impact before it can become active.
- A **Control** may have external standards mappings.
- External standards mappings contain a framework, reference, and optional description.
- A **Control** accepts one or more **Accepted Evidence Types**.
- Initial **Accepted Evidence Types** are document, link, file upload, test result, scanner result, approval record, and not applicable justification.
- A **Control**'s verification method is required descriptive text.
- A **Control**'s applicability conditions are required plain-language text until structured applicability rules are defined.
- A **Control** has one or more **Control Versions**.
- **Control Versions** are numbered sequentially per **Control**.
- A **Control** has a **Release Impact** of blocking, needs review, or advisory.
- Existing usages of a **Control** keep the **Control Version** they were created with.
- New usages of a **Control** use the latest **Control Version**.
- A **Control** can be draft, active, or archived.
- A **Draft Control** is unavailable for templates and checklists.
- Publishing a new **Control** may require approval according to the **Control Approval Policy**.
- Publishing a policy-meaning update to an active **Control** may require approval according to the **Control Approval Policy**.
- When the **Control Approval Policy** is enabled, **Control** publish actions must be submitted for review before publishing.
- The **Control Approval Policy** defines how many approvals are required for **Control** publish actions.
- **Control Publish Requests** are approved by eligible **Organization** owners and admins.
- A **Control Publish Request** cannot be approved by its own author.
- When the **Control Approval Policy** is disabled, **Organization** owners and admins can publish without separate approval.
- An **Archived Control** is unavailable for new templates and checklists.
- An **Archived Control** must be restored before its release assurance meaning can be changed.
- Existing usages of an **Archived Control** remain linked to their original **Control Version**.
- Changes to a **Control**'s Control Code, title, business meaning, verification method, accepted evidence types, applicability conditions, Release Impact, and external standards mappings create a new **Control Version**.
- A blocking **Control** must pass or have an approved exception before release.
- A needs review **Control** requires human review before release.
- An advisory **Control** does not block release by itself.
- Changes to **Control Metadata** do not create a new **Control Version**.
- **Checklist Templates** reference **Controls** from the **Control Library**.
- **Control Library** management does not apply **Controls** directly to **Projects**.

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
> **Dev:** "Should we build **Checklist Templates** before defining **Controls**?"
> **Domain expert:** "No — templates should reference stable **Controls** from the **Control Library**."
> **Dev:** "Who chooses a **Control Code** like AUTH-001?"
> **Domain expert:** "Organization admins manage **Control Codes** because they are policy-facing references."
> **Dev:** "If a **Control Code** changes, do old audit records show the new code?"
> **Domain expert:** "No — old usages keep the **Control Code** from their **Control Version**, and new usages use the latest code."
> **Dev:** "If a **Control** changes, do previous release decisions change meaning too?"
> **Domain expert:** "No — previous usages keep the old **Control Version**, and new usages use the latest one."
> **Dev:** "Does changing a **Control**'s display order create a new **Control Version**?"
> **Domain expert:** "No — display order is **Control Metadata**, not part of the Control's release assurance meaning."
> **Dev:** "When a **Control** is no longer wanted, do we delete it?"
> **Domain expert:** "No — it becomes an **Archived Control** so historical usages still point to their original **Control Version**."

## Flagged ambiguities

- "project profile" was used for the next product area — resolved: the domain object is **Project**; the profile is its detail UI.
- "owner" can mean either **Project Owner** or **Organization** owner — resolved: use **Project Owner** for project accountability and Organization owner for the access role.
- **Project Owner** was initially considered required — resolved: it is optional.
- **Project** status was initially deferred — resolved: only active vs archived is needed now; broader governance workflow statuses are not defined yet.
- **Checklist Templates** were listed before **Control Library** in the feature order — resolved: implement **Control Library** first because templates need stable **Control** references.
- Editing a **Control** could have changed previous usages retroactively — resolved: previous usages keep their original **Control Version** and new usages use the latest version.
- Some **Control** edits affect audit-preserved meaning while others are administrative — resolved: core policy fields and **Control Code** create **Control Versions**, while **Control Metadata** remains editable.
- Removing a **Control** from future use could have implied deletion — resolved: it becomes an **Archived Control** and historical usages are preserved.
- A unique Control identifier could have meant only an internal database ID — resolved: **Control Code** is the organization-managed policy-facing identifier.
- Changing a **Control Code** could have rewritten historical references — resolved: old usages keep the **Control Code** from their original **Control Version**.
