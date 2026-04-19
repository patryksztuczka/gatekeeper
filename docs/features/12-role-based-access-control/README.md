# Role-Based Access Control

## Purpose

Role-based access control defines what authenticated users and agents are allowed to view, edit, approve, or administer within Gatekeeper.

It should operate within an organization model so that access is scoped not only by role, but also by the organization that owns the projects, policies, evidence, and release records.

## Business Value

- prevents unauthorized access to sensitive release data,
- ensures that only the right people can approve releases or exceptions,
- supports separation of duties,
- reduces governance risk from overly broad access.

## Users Involved

- release owners,
- developers and technical owners,
- security, platform, and operations reviewers,
- auditors and leadership stakeholders,
- organization administrators,
- system administrators,
- connected agents with scoped permissions.

## Organization Model

Gatekeeper should treat the organization as the primary business boundary for access control.

- each user or agent should act within one or more organizations,
- organizations should own their projects, release records, evidence, policies, and audit history,
- access should be granted within the context of an organization membership,
- users should not see or act on another organization's data unless explicitly allowed.

## Core Workflow

1. A user or agent authenticates.
2. Gatekeeper resolves the organizations that identity belongs to.
3. Gatekeeper resolves the roles assigned to that identity within the active organization.
4. The system allows or denies actions based on both organization membership and role.
5. Sensitive operations such as approvals, policy changes, and exception decisions are limited to authorized roles within the relevant organization.

## Key Business Rules

- access should be granted according to role and responsibility,
- access should be scoped to the organization that owns the relevant project or policy,
- users should only see and change the data needed for their function,
- organization membership should be required before a role can be exercised,
- approval authority should be restricted to the correct roles,
- roles may differ between organizations for the same person,
- policy administration should be separated from routine project execution where appropriate,
- organization administrators should be able to manage membership and organization-scoped permissions,
- cross-organization access should be explicit and exceptional rather than assumed by default,
- agent permissions should be explicitly scoped rather than broad by default.

## Outputs

- controlled access to Gatekeeper capabilities,
- organization-level data isolation,
- clearer separation of duties,
- stronger governance over approvals and policy changes.

## Dependencies

- authentication,
- approval workflow,
- exception governance,
- audit log,
- agent workflows through MCP.

## Out of Scope

Role-based access control does not authenticate identities. It governs authorization after identity has been established.

This document also does not define the full commercial or legal account model for organizations. It defines the business access boundary needed for Gatekeeper governance.
