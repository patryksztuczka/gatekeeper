# Success Metrics and KPIs

## Success Criteria

Gatekeeper should be considered successful when it leads to:

- more complete and higher-quality release evidence,
- earlier detection of missing controls,
- fewer informal release exceptions,
- fewer unstable releases,
- stable or improved deployment speed,
- consistent release governance across projects,
- clear visibility into release risk and decision history.

## Business KPIs

### Release assurance quality

Track whether releases have complete, current, and reviewable evidence before approval.

Potential measures:

- percentage of releases with complete required evidence,
- percentage of blocking controls resolved before release review,
- percentage of critical controls with completed human review.

### Governance discipline

Track whether teams follow a consistent, auditable release process.

Potential measures:

- number of informal or out-of-band exceptions,
- percentage of exceptions with owner, approver, and expiration date,
- percentage of releases with full approval history.

### Operational efficiency

Track whether Gatekeeper reduces manual coordination and repeated review work.

Potential measures:

- time spent collecting evidence,
- review turnaround time,
- evidence reuse rate across releases,
- number of checks completed through integrations or agents.

### Delivery outcomes

Use DORA-style delivery measures to confirm that stronger governance does not damage flow.

Track:

- lead time for change,
- deployment frequency,
- change failure rate,
- time to restore service,
- deployment rework rate.

## Review Cadence

These metrics should be reviewed at both project level and organizational level so that policy tuning, template updates, and maturity planning can be based on real operating data.
