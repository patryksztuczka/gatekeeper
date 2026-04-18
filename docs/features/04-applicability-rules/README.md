# Applicability Rules

## Purpose

Applicability rules determine whether a control is relevant for a specific project and why.

## Business Value

- prevents unnecessary review effort,
- reduces friction from irrelevant controls,
- makes policy decisions more defensible,
- improves trust in the release process.

## Users Involved

- release owners,
- developers and technical owners,
- specialist reviewers,
- automated agents applying project context.

## Core Workflow

1. Gatekeeper reads the project profile and template baseline.
2. Each control is evaluated for applicability.
3. The system records the reason for the resulting applicability state.
4. Only relevant controls continue into active evaluation and approval.

## Key Business Rules

The system should determine whether a control is:

- applicable,
- not applicable,
- inherited from a shared platform,
- covered by a compensating control,
- temporarily waived through an approved exception.

When a control does not apply, the reason should be explicit and recorded.

## Outputs

- project-specific control set,
- recorded rationale for applicability decisions,
- lower noise in release assurance workflows.

## Dependencies

- project profiles,
- checklist templates,
- control library,
- exception governance.

## Out of Scope

Applicability rules do not eliminate the need for human judgment in unusual cases or for policy changes when patterns shift across the organization.
