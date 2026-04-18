# Control Evaluation

## Purpose

Control evaluation translates evidence and reviewer input into structured control outcomes that inform the release decision.

## Business Value

- creates more meaningful outcomes than simple yes or no answers,
- makes decisions easier to review and explain,
- supports risk-based policy enforcement,
- improves transparency around unresolved uncertainty.

## Users Involved

- developers and technical owners,
- specialist reviewers,
- release owners,
- agents proposing answers where allowed.

## Core Workflow

1. A control is reviewed against available evidence.
2. A status is assigned.
3. The system records who answered, how the answer was created, and whether human review accepted it.
4. The result contributes to the overall release readiness decision.

## Key Business Rules

Possible outcomes should include:

- passed,
- failed,
- needs review,
- not applicable,
- inherited,
- waived.

Each evaluation should record:

- who answered,
- how the answer was created,
- what evidence supports it,
- whether a human reviewer accepted it.

## Outputs

- structured control statuses,
- review traceability,
- direct input into release readiness logic.

## Dependencies

- evidence collection,
- applicability rules,
- approval workflow,
- release decision policy.

## Out of Scope

Control evaluation does not replace final release approval. It provides the structured input required for that decision.
