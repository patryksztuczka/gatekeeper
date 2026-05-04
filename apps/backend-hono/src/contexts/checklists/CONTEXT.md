# Checklists

Checklists define Project-specific control tracking work. This context owns Checklist Template language, Project Checklist creation, Checklist Item state, and the boundary between reusable Controls and Project execution.

## Language

**Checklist Template**:
A reusable set of Controls used to start Project Checklists.
_Avoid_: Template when the source collection is the Control Library.

**Archived Checklist Template**:
A Checklist Template hidden from new Project Checklist creation without being deleted.
_Avoid_: Deleted template when the record is retained.

**Project Checklist**:
A checklist attached to one Project for tracking selected Controls.
_Avoid_: Checklist when it could mean a reusable Checklist Template.

**Archived Project Checklist**:
A Project Checklist hidden from active checklist work without being deleted.
_Avoid_: Deleted checklist when the record is retained.

**Checklist Item**:
A Project Checklist entry that preserves the Control Version it was created from.
_Avoid_: Check when referring to a reusable Control or a Project Checklist entry.

**Removed Checklist Item**:
A Checklist Item removed from active Project Checklist work without being deleted.
_Avoid_: Deleted item when the record is retained.

**Superseded Checklist Item**:
A Checklist Item replaced by a newer Control Version without being deleted.
_Avoid_: Removed item when the reason is Control Version replacement.

**Checklist Item State**:
The binary checked or unchecked state of a Checklist Item.
_Avoid_: Status when referring only to checked vs unchecked.

**Complete Project Checklist**:
A Project Checklist whose active Checklist Items are all checked.
_Avoid_: Checklist status when completion can be derived.

**Checklist Item Refresh**:
An owner/admin action that replaces a Checklist Item with one for the latest Control Version.
_Avoid_: Modify when changing which Control Version a Checklist Item represents.

**Archived Control Enforcement**:
An owner/admin action that removes Checklist Items created from an Archived Control from active Project Checklist work.
_Avoid_: Hide when retained checklist history is meant.

## Relationships

- A **Project** can have zero or many **Project Checklists**.
- A **Project Checklist** belongs to exactly one **Project**.
- A **Project Checklist** is either active or archived.
- An **Archived Project Checklist** is hidden from active checklist work but retained.
- An **Archived Project Checklist** is read-only.
- A **Project Checklist** contains one or more **Checklist Items**.
- A **Project Checklist** is complete when all active **Checklist Items** are checked.
- **Complete Project Checklist** is derived from **Checklist Item State** for MVP.
- A **Checklist Item** belongs to exactly one **Project Checklist**.
- A **Checklist Item** is active, removed, or superseded.
- A **Removed Checklist Item** is hidden from active checklist work but retained.
- A **Superseded Checklist Item** is hidden from active checklist work but retained.
- **Removed Checklist Items** and **Superseded Checklist Items** do not count toward **Complete Project Checklist**.
- **Removed Checklist Items** and **Superseded Checklist Items** cannot be restored for MVP.
- Re-adding a removed or superseded **Control** creates a new active **Checklist Item**.
- A **Checklist Item** preserves the **Control Version** it was created from.
- A **Checklist Item** has a **Checklist Item State**.
- **Checklist Item State** is either checked or unchecked.
- Checking a **Checklist Item** does not change the underlying **Control**.
- Publishing a new **Control Version** does not automatically change existing **Checklist Items**.
- Organization owners and admins can perform a **Checklist Item Refresh** on a **Project Checklist**.
- A **Checklist Item Refresh** replaces an old-version **Checklist Item** with a latest-version **Checklist Item** and makes the old item a **Superseded Checklist Item**.
- A refreshed **Checklist Item** starts unchecked even when the old-version **Checklist Item** was checked.
- **Checklist Item Refresh** is scoped to one **Project Checklist** for MVP.
- Archiving a **Control** does not automatically change existing **Checklist Items**.
- **Checklist Items** created from an **Archived Control** remain visible by default.
- Organization owners and admins can perform **Archived Control Enforcement** on a **Project Checklist**.
- **Archived Control Enforcement** creates **Removed Checklist Items**.
- **Archived Control Enforcement** is scoped to one **Project Checklist** for MVP.
- **Archived Controls** cannot be added to new **Checklist Templates** or **Project Checklists**.
- A **Checklist Template** contains selected active **Controls** for starting **Project Checklists**.
- A **Checklist Template** is created with a name and one or more selected active **Controls**.
- A **Checklist Template** references **Controls**, not fixed **Control Versions**.
- Active **Checklist Template** names are unique within an **Organization**.
- **Archived Checklist Templates** retain their names without blocking active name reuse.
- A **Control** can appear in multiple **Checklist Templates**.
- A **Control** cannot appear more than once in the same **Checklist Template**.
- A **Checklist Template** is either active or archived.
- An **Archived Checklist Template** is hidden from new **Project Checklist** creation but retained.
- **Project Checklists** created from a **Checklist Template** are not changed when the template becomes an **Archived Checklist Template**.
- Editing a **Checklist Template** does not change existing **Project Checklists** created from it.
- Editing a **Checklist Template** affects only future **Project Checklists**.
- Only Organization owners and admins can view and manage **Checklist Templates**.
- Organization owners and admins can rename active **Checklist Templates**.
- Organization owners and admins can restore **Archived Checklist Templates**.
- A **Checklist Template** that references **Archived Controls** cannot be used to create new **Project Checklists** until those **Archived Controls** are removed from the template or restored.
- **Checklist Template** management does not require a publish or approval workflow for MVP.
- Organization members who are not owners or admins do not see **Checklist Templates**.
- A **Project Checklist** can be created from a **Checklist Template**.
- A **Project Checklist** can be created by manually selecting active **Controls**.
- A **Project Checklist** may record the **Checklist Template** it was created from.
- A manually created **Project Checklist** has no source **Checklist Template**.
- A source **Checklist Template** link is traceability only and does not change **Project Checklist** behavior.
- A **Project Checklist** is created with a name and one or more **Checklist Items**.
- Active **Project Checklist** names are unique within a **Project**.
- **Archived Project Checklists** retain their names without blocking active name reuse in the same **Project**.
- Creating a **Project Checklist** always creates **Checklist Items** that preserve the selected **Control Versions**.
- A **Project Checklist** created from a **Checklist Template** uses the latest active **Control Versions** at creation time.
- A **Control** can appear in multiple **Project Checklists** on the same **Project**.
- A **Control** cannot appear more than once among active **Checklist Items** in the same **Project Checklist**.
- **Project Checklists** can be created only for active **Projects**.
- **Project Checklists** on **Archived Projects** are retained read-only.
- **Checklist Items** on **Archived Projects** cannot be checked, unchecked, added, removed, or refreshed.
- All Organization Members who can view a **Project** can view its **Project Checklists**.
- Organization owners and admins can create **Project Checklists**.
- Organization owners and admins can rename active **Project Checklists**.
- Organization owners and admins can add active **Controls** to active **Project Checklists**.
- Adding a **Control** to an existing **Project Checklist** creates an unchecked **Checklist Item** for the latest active **Control Version**.
- Organization owners and admins can archive **Project Checklists**.
- Organization owners and admins can restore **Archived Project Checklists** while their **Project** is active.
- **Archived Project Checklists** cannot be restored while their **Project** is archived.
- **Project Checklist** management does not require a publish or approval workflow for MVP.
- A **Project Owner** can check and uncheck **Checklist Items** on their **Project Checklists**.
- Only the **Project Owner** can check and uncheck **Checklist Items**.
- Organization owners and admins cannot check or uncheck **Checklist Items** unless they are also the **Project Owner**.
- If a **Project** has no **Project Owner**, no one can check or uncheck its **Checklist Items**.
- Checking a **Checklist Item** is not a permission to create, edit, archive, or publish **Controls**.

## Example dialogue

> **Dev:** "Is a **Project Checklist** the same thing as the **Control Library**?"
> **Domain expert:** "No — the **Control Library** defines reusable **Controls**; a **Project Checklist** tracks selected Controls for one **Project**."
> **Dev:** "Can a **Project** exist without a **Project Checklist**?"
> **Domain expert:** "Yes — a **Project** can have zero or many **Project Checklists**."
> **Dev:** "If a **Control** changes after it was added to a **Project Checklist**, does the **Checklist Item** change?"
> **Domain expert:** "No — the **Checklist Item** keeps the **Control Version** captured when it was created."
> **Dev:** "Can a **Project Owner** create **Project Checklists**?"
> **Domain expert:** "No — Organization owners and admins create **Project Checklists**; the **Project Owner** checks and unchecks **Checklist Items**."
> **Dev:** "Does every **Project Checklist** have to come from a **Checklist Template**?"
> **Domain expert:** "No — a **Project Checklist** can start from a **Checklist Template** or from manually selected active **Controls**."
> **Dev:** "If a **Project Checklist** records its source **Checklist Template**, does it receive template updates?"
> **Domain expert:** "No — the source template is traceability only."
> **Dev:** "Can someone create an empty **Checklist Template** or **Project Checklist**?"
> **Domain expert:** "No — both need a name and at least one selected active **Control**."
> **Dev:** "Can two **Checklist Templates** contain the same **Control**?"
> **Domain expert:** "Yes, but one **Checklist Template** cannot contain the same **Control** more than once."
> **Dev:** "Can two active **Checklist Templates** in one **Organization** have the same name?"
> **Domain expert:** "No — active **Checklist Template** names are unique within an **Organization**."
> **Dev:** "Can an owner rename an active **Checklist Template**?"
> **Domain expert:** "Yes, as long as the new name is unique among active **Checklist Templates** in the **Organization**."
> **Dev:** "Can the same **Control** appear in two **Project Checklists** on the same **Project**?"
> **Domain expert:** "Yes, but the same **Control** cannot appear twice among active **Checklist Items** in one **Project Checklist**."
> **Dev:** "Can two active **Project Checklists** on one **Project** have the same name?"
> **Domain expert:** "No — active **Project Checklist** names are unique within a **Project**."
> **Dev:** "Can an admin rename an active **Project Checklist**?"
> **Domain expert:** "Yes, as long as the new name is unique among active **Project Checklists** on that **Project**."
> **Dev:** "Can an owner add another **Control** to an existing **Project Checklist**?"
> **Domain expert:** "Yes — adding an active **Control** creates an unchecked **Checklist Item** for the latest active **Control Version**."
> **Dev:** "Does a **Checklist Item** need statuses like not applicable or needs evidence?"
> **Domain expert:** "No — for now, **Checklist Item State** is only checked or unchecked."
> **Dev:** "Do we store a separate complete status for a **Project Checklist**?"
> **Domain expert:** "No — a **Complete Project Checklist** is derived when all active **Checklist Items** are checked."
> **Dev:** "When an owner removes a **Checklist Item**, is it deleted?"
> **Domain expert:** "No — it becomes a **Removed Checklist Item** and no longer counts toward completion."
> **Dev:** "When an owner refreshes a **Checklist Item** to a newer **Control Version**, is the old item removed?"
> **Domain expert:** "No — it becomes a **Superseded Checklist Item** because it was replaced by a newer **Control Version**."
> **Dev:** "Can a **Removed Checklist Item** be restored?"
> **Domain expert:** "No — for MVP, re-adding the **Control** creates a new active **Checklist Item**."
> **Dev:** "If a **Control** gets a new **Control Version**, are existing checked **Checklist Items** automatically unchecked?"
> **Domain expert:** "No — owners/admins can refresh the **Checklist Item** for one **Project Checklist**, and the refreshed item starts unchecked."
> **Dev:** "If a **Control** is archived, are existing **Checklist Items** removed automatically?"
> **Domain expert:** "No — they remain visible by default; owners/admins can enforce removal from one **Project Checklist**."
> **Dev:** "Does a **Checklist Template** keep old **Control Versions**?"
> **Domain expert:** "No — a **Checklist Template** references **Controls**, and a new **Project Checklist** uses the latest active **Control Versions** when it is created."
> **Dev:** "If an owner edits a **Checklist Template**, do existing **Project Checklists** update?"
> **Domain expert:** "No — template edits affect future **Project Checklists** only."
> **Dev:** "Can regular Organization members browse **Checklist Templates**?"
> **Domain expert:** "No — only Organization owners and admins can view and manage **Checklist Templates**."
> **Dev:** "If a **Checklist Template** is no longer wanted, do we delete it?"
> **Domain expert:** "No — it becomes an **Archived Checklist Template** and is unavailable for new **Project Checklist** creation."
> **Dev:** "Can a restored **Checklist Template** immediately be used if it still references **Archived Controls**?"
> **Domain expert:** "No — those **Archived Controls** must be removed from the template or restored first."
> **Dev:** "Do checklist changes need approval like **Control** publishing can?"
> **Domain expert:** "No — for MVP, Organization owners and admins manage **Checklist Templates** and **Project Checklists** directly."
> **Dev:** "Can members view **Project Checklists** on Projects they can access?"
> **Domain expert:** "Yes — **Project Checklist** visibility follows **Project** visibility, but only the **Project Owner** changes **Checklist Item State**."
> **Dev:** "Can Organization owners and admins check items for the **Project Owner**?"
> **Domain expert:** "No — they can manage **Project Checklists**, but only the **Project Owner** checks or unchecks **Checklist Items**."
> **Dev:** "Who checks **Checklist Items** when a **Project** has no **Project Owner**?"
> **Domain expert:** "No one — the **Project** needs a **Project Owner** before **Checklist Items** can be checked or unchecked."
> **Dev:** "Can an Organization admin add a **Project Checklist** to an **Archived Project**?"
> **Domain expert:** "No — retained **Project Checklists** on **Archived Projects** are read-only."
> **Dev:** "Can a checklist stop being active while the **Project** stays active?"
> **Domain expert:** "Yes — Organization owners and admins can archive a **Project Checklist** without archiving the **Project**."
> **Dev:** "Can an **Archived Project Checklist** be restored while its **Project** is archived?"
> **Domain expert:** "No — the **Project** must be active before its **Archived Project Checklist** can be restored."

## Flagged ambiguities

- "checklist" can mean either reusable setup or Project execution — resolved: use **Checklist Template** for reusable setup and **Project Checklist** for Project-specific tracking.
- "checked control" could imply changing a reusable **Control** — resolved: the Project Owner checks a **Checklist Item**, while the underlying **Control** remains unchanged.
- "owners" can mean Organization owners or **Project Owner** — resolved: Organization owners/admins create **Project Checklists**; the **Project Owner** checks **Checklist Items**.
- **Checklist Templates** could have been mandatory for creating **Project Checklists** — resolved: templates are optional; owners/admins can also manually select active **Controls**.
- A source **Checklist Template** link could have created automatic behavior for **Project Checklists** — resolved: it is traceability only.
- Empty **Checklist Templates** and **Project Checklists** could have been allowed for drafting — resolved: both require a name and at least one selected active **Control**.
- Checklist item ordering could have been part of MVP — resolved: **Checklist Templates** and **Project Checklists** do not define custom item order for MVP.
- Duplicate **Controls** could have been blocked across all **Checklist Templates** — resolved: a **Control** may appear in multiple **Checklist Templates**, but not more than once inside one **Checklist Template**.
- Duplicate **Controls** could have been blocked across an entire **Project** — resolved: a **Control** may appear in multiple **Project Checklists**, but not more than once among active **Checklist Items** inside one **Project Checklist**.
- **Checklist Template** names could have been globally unique or freely duplicated — resolved: active names are unique within an **Organization**, while archived names do not block reuse.
- **Project Checklist** names could have been globally unique or freely duplicated — resolved: active names are unique within one **Project**, while archived names do not block reuse.
- Removing a **Checklist Item** could have physically deleted it — resolved: it becomes a **Removed Checklist Item** and is excluded from active checklist work.
- Refreshing a **Checklist Item** could have been treated as ordinary removal — resolved: the old item becomes a **Superseded Checklist Item** so Control Version replacement remains distinguishable.
- Inactive **Checklist Items** could have been restorable — resolved: **Removed Checklist Items** and **Superseded Checklist Items** cannot be restored for MVP; re-adding creates a new active **Checklist Item**.
- **Checklist Item State** could have included not applicable, comments, evidence, or partial progress — resolved: for now it is only checked or unchecked.
- **Project Checklist** completion could have been stored as its own status — resolved: **Complete Project Checklist** is derived from active **Checklist Item State** for MVP.
- Changing the source **Control** could have automatically changed existing **Checklist Items** — resolved: existing items keep their captured **Control Version** until an owner/admin performs a **Checklist Item Refresh**.
- Enforcing a new **Control Version** could have been global across all **Project Checklists** — resolved: for MVP, **Checklist Item Refresh** is scoped to one **Project Checklist**.
- Archiving a **Control** could have automatically removed existing **Checklist Items** — resolved: existing items remain visible until an owner/admin performs **Archived Control Enforcement** for one **Project Checklist**.
- **Checklist Templates** could have preserved fixed **Control Versions** — resolved: they reference **Controls**, and **Project Checklists** capture latest active **Control Versions** when created.
- Editing a **Checklist Template** could have acted like a live subscription for existing **Project Checklists** — resolved: template edits affect future **Project Checklists** only.
- **Checklist Templates** could have been visible to all Organization Members — resolved: only Organization owners and admins can view and manage them.
- Removing a **Checklist Template** from future use could have implied deletion — resolved: it becomes an **Archived Checklist Template** and existing **Project Checklists** are unchanged.
- Restoring an **Archived Checklist Template** could have made **Archived Controls** available for new use — resolved: templates that reference **Archived Controls** cannot create new **Project Checklists** until those Controls are removed or restored.
- Checklist setup could have reused **Control Publish Governance** — resolved: **Checklist Template** and **Project Checklist** management has no publish or approval workflow for MVP.
- **Project Checklist** visibility could have followed **Checklist Template** visibility — resolved: **Project Checklists** follow **Project** visibility, while **Checklist Templates** remain owner/admin-only.
- Organization owner/admin checklist management could have included completion — resolved: only the **Project Owner** can check and uncheck **Checklist Items**, unless an Organization owner/admin is also the **Project Owner**.
- Optional **Project Owner** could have allowed fallback completion by Organization owners/admins — resolved: when a **Project** has no **Project Owner**, no one can check or uncheck **Checklist Items**.
- **Archived Projects** could have allowed checklist changes because their details remain reachable — resolved: **Project Checklists** on **Archived Projects** are retained read-only.
- Retiring **Project Checklist** work could have required archiving the whole **Project** — resolved: owners/admins can archive a **Project Checklist** independently.
- Restoring an **Archived Project Checklist** could have bypassed **Project** lifecycle — resolved: it can be restored only while its **Project** is active.
