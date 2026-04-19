# Project Profiles

## Purpose

Project profiles capture the business and technical context needed to decide which controls apply to a project.

## Business Value

- avoids treating every project as if it has the same risk,
- improves consistency of applicability decisions,
- reduces unnecessary review work,
- gives release owners clearer context for approvals.

## Users Involved

- production or release owner,
- developer or technical owner,
- security, platform, or operations reviewer,
- automated agents that read project context.

## Core Workflow

1. A project owner defines the profile.
2. The profile records key business and technical attributes.
3. Gatekeeper uses those attributes to determine which controls apply.
4. Reviewers use the profile as the baseline context for release decisions.

## Key Business Rules

The profile should capture information such as:

- whether the project is internet-facing,
- whether it stores sensitive data,
- whether it provides authentication and authorization,
- whether it depends on shared platform protections,
- the risk and criticality level,
- the type of application and delivery model.

The profile should be current enough to support reliable applicability and approval decisions.

## Outputs

- project context for checklist generation,
- input to applicability rules,
- shared release context for reviewers and agents.

## Dependencies

- checklist templates,
- applicability rules,
- control library.

## Out of Scope

Project profiles do not replace detailed architecture documentation or system inventories managed elsewhere.
