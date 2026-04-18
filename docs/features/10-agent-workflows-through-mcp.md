# Agent Workflows Through MCP

## Purpose

Agent workflows allow controlled automation through the Model Context Protocol so Gatekeeper can reduce manual work without removing human accountability.

## Business Value

- lowers routine coordination effort,
- moves verification earlier in delivery,
- improves evidence collection scalability,
- supports faster remediation of missing controls.

## Users Involved

- automated agents connected through MCP,
- developers and technical owners,
- release owners,
- specialist reviewers for human oversight.

## Core Workflow

1. An agent reads project context.
2. The agent lists applicable controls and evidence expectations.
3. The agent proposes answers, gathers evidence from connected systems, or opens remediation work.
4. Humans review critical outputs where required.

## Key Business Rules

Agents should be able to:

- read project context,
- list applicable controls,
- inspect evidence requirements,
- propose answers,
- collect evidence from connected systems,
- open remediation work.

For critical controls, human review must remain mandatory.

## Outputs

- proposed answers,
- imported evidence,
- remediation tasks,
- reduced manual effort in the release process.

## Dependencies

- project profiles,
- applicability rules,
- evidence collection,
- control evaluation,
- approval workflow.

## Out of Scope

Agent workflows do not grant autonomous authority to approve critical controls or final releases.
