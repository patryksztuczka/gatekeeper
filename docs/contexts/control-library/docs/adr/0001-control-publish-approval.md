# ADR 0001: Control Publish Approval

_Moved from global ADR 004._

## Status

Accepted

## Context

The Control Library is the source of reusable release assurance policy. Allowing normal Organization members to contribute draft Controls and proposed Control updates improves collaboration, but publishing those changes directly would let routine project participants change policy without governance review.

## Decision

Control publish actions are governed by an Organization-scoped Control Approval Policy. Members may author draft Controls and proposed Control updates, but only Organization owners and admins can publish Controls or Control updates.

When the Control Approval Policy is enabled, publishing a new Control or a policy-meaning update requires submission and the configured number of approvals from eligible Organization owners/admins other than the author. When the policy is disabled, Organization owners/admins may publish without separate approval.

## Consequences

This keeps Control authoring open to contributors while preserving separation of duties for policy changes. It also means the Control Library module must include publish request state, approval records, and Organization settings for whether approval is required and how many approvals are needed.
