# Evidence Collection

## Purpose

Evidence collection gives Gatekeeper the proof needed to support release decisions.

## Business Value

- replaces unsupported statements with verifiable proof,
- reduces scattered documentation and repeated requests,
- improves audit readiness,
- creates the foundation for automation and evidence reuse.

## Users Involved

- developers and technical owners,
- specialist reviewers,
- release owners,
- agents collecting or proposing evidence from connected systems.

## Core Workflow

1. Evidence is added by people, imported from tools, or proposed by agents.
2. Evidence is attached to the relevant control or evaluation.
3. Reviewers assess whether the evidence is complete, current, and credible.
4. Evidence is reused where still valid.

## Inputs and Evidence Types

Evidence may include:

- scanner results,
- build records,
- infrastructure configuration references,
- software bill of materials,
- links to issue records,
- architecture documents,
- reviewer notes,
- approval records.

## Key Business Rules

- approvals should be based on evidence, not unsupported assertions,
- evidence should be reusable when still valid,
- evidence should support both human review and later audit.

## Outputs

- attached proof for control decisions,
- improved review quality,
- reusable records for future releases.

## Dependencies

- control library,
- control evaluation,
- audit log,
- integrations and agent workflows.

## Out of Scope

Evidence collection does not replace the source systems that produce scanner results, tickets, or artifacts.
