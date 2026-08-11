# Counsel handoff — open items for the policy drafts

Status tracker for the unreviewed policy drafts under
`frontend/lib/policies/content/` (privacy notice, terms, data-use page). Each
item below must be resolved by a human (founders / infra / counsel) before the
drafts are published; none of them can be resolved from the codebase alone.

## Open items

### 1. Subprocessor table is incomplete (privacy notice, A3) — BLOCKS PUBLISHING

The A3 table lists the vendors verifiable from code (Stripe, Resend, PostHog,
Sentry, Loops, AWS). The complete hosting stack for the cloud deployment —
managed Postgres/ClickHouse vendors, CDN, DNS — is defined in infrastructure
outside this repository and must be confirmed by infra before the notice is
published. Do not fill the gaps by guessing; a wrong vendor entry in a legal
document propagates.

### 2. Analytics retention (privacy notice, A4)

A4 says analytics and diagnostics are "retained per our analytics providers'
configured retention." PostHog and Sentry project-level retention are
configured in those vendors' dashboards, not in code. Confirm the configured
values (or decide to state concrete periods) before publishing.

### 3. Customer Data deletion caveats (privacy notice, B6)

B6's deletion language stays as written. Before we can promise more, note:

- Object-storage payloads (S3) are not covered by the automated project purge
  today — access is revoked when the project row is deleted, but the blobs
  remain. An S3 lifecycle/cleanup policy is required before promising full
  deletion. Product work outside this PR.
- Plan retention windows are enforced at query time (access cutoff), not by
  physical deletion. If we ever want to promise deletion at window end,
  product work is required.
- Backup retention periods are set at the infrastructure level and are not
  visible from this repository.

## Rollout notes

### 30-day notice email to free-tier workspaces (human task)

The per-plan Privacy Mode defaults take effect at [EFFECTIVE_DATE], after the
notice period. The notice email to Free and Hobby workspaces must state
explicitly:

- that Privacy Mode will default to OFF for their tier at the effective date;
- what data is involved (redacted Signal run data — the trace content the
  Signals feature examined and the outputs it produced, after PII redaction);
- a link to the workspace-settings toggle so they can set it explicitly.

Notice copy is a human task, not agent scope.

### [EFFECTIVE_DATE] placeholder

The placeholder appears in ToS §16, privacy notice B4, the data-use page, and
`PRIVACY_MODE_TIER_DEFAULTS_EFFECTIVE_DATE` in
`frontend/lib/actions/workspace/settings.ts` (currently `null`, which keeps
every unset workspace resolved to Privacy Mode ON). All four must be set to
the same date at rollout.

### DPA enforcement flag

`dpaEnforcedPrivacyMode` in `workspaces.settings` is set out-of-band (ops)
when an account signs a DPA. It locks Privacy Mode on and overrides any
explicit choice, including an explicit off recorded before the DPA was
signed. There is deliberately no API surface to write it.
