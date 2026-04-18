# Exception Governance

## Purpose

Exception governance manages cases where a control cannot be satisfied but the organization chooses to proceed under explicit, approved risk.

## Business Value

- prevents silent bypass of policy,
- makes risk acceptance visible and auditable,
- improves accountability for temporary deviations,
- supports safer decision-making when full compliance is not possible.

## Users Involved

- release owners,
- developers and technical owners,
- security, platform, or operations reviewers,
- approving stakeholders.

## Core Workflow

1. A project identifies a control that cannot be satisfied.
2. An exception request is created with justification and ownership.
3. The right approver reviews the exception.
4. The approved exception is tracked until expiration or review.

## Key Business Rules

A formal exception should include:

- business reason,
- technical reason,
- risk statement,
- compensating control when available,
- owner,
- approver,
- expiration date,
- review date.

Exceptions should be visible, justified, approved by the right person, and limited by time when needed.

## Outputs

- explicit record of accepted risk,
- governed waivers for release decisions,
- auditable exception history.

## Dependencies

- control evaluation,
- approval workflow,
- audit log,
- release decision policy.

## Out of Scope

Exception governance is not a mechanism for permanently ignoring policy. It is a controlled path for limited and reviewable deviation.
