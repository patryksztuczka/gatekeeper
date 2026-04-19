# Release Decision Policy

## Policy Goal

Gatekeeper should determine release readiness through a policy-driven process rather than informal judgment. A release decision should reflect evidence quality, control status, exception validity, and required approvals.

## Core Readiness Model

A release should be evaluated against applicable controls and their supporting evidence.

Control outcomes should include:

- passed,
- failed,
- needs review,
- not applicable,
- inherited,
- waived.

The decision model should also record:

- who answered,
- how the answer was created,
- what evidence supports it,
- whether human review was required and completed.

## Release Blocking Conditions

A release may be blocked when:

- a blocking control has failed,
- required evidence is missing,
- a critical control has only an automated answer without human review,
- an exception is missing approval,
- an exception has expired,
- the project has unresolved high-risk findings.

## Release Approval Conditions

A release may proceed when:

- all blocking controls are satisfied,
- exceptions are approved and still valid,
- required reviewers have signed off,
- evidence is complete and current.

## Exception Policy

A control that cannot be satisfied should not disappear silently. A formal exception should capture:

- business reason,
- technical reason,
- risk statement,
- compensating control when available,
- owner,
- approver,
- expiration date,
- review date.

## Approval Policy

The platform should support a defined approval path that can include:

- project-level approval,
- domain-specific approval,
- approval with conditions,
- blocking conditions,
- approval history.

## Accountability Policy

Automation may assist with evidence collection and answer proposals, but critical controls must still require human review.
