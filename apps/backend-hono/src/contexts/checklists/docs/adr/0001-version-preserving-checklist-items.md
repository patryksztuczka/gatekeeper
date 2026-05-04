# ADR 0001: Version-Preserving Checklist Items

## Status

Accepted

## Context

Project Checklists apply reusable Controls to Project execution, but Controls can change meaning through new Control Versions after a Checklist Item has already been checked. Mutating existing Checklist Items to the latest Control Version would rewrite what the Project Owner actually checked, while automatic cross-project updates would create broad side effects from Control Library changes.

## Decision

Each Checklist Item preserves the Control Version it was created from. Publishing a new Control Version does not automatically change existing Checklist Items.

Organization owners and admins may refresh a Checklist Item within one Project Checklist. Refresh creates a new unchecked Checklist Item for the latest active Control Version and makes the old item a Superseded Checklist Item. The refresh is scoped to one Project Checklist for MVP.

## Consequences

Project Owner completion remains tied to the exact Control Version they checked. New Control meaning must be intentionally enforced per Project Checklist, and refreshed items start unchecked because the Project Owner has not checked the newer Control Version.
