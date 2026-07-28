# Counsel handoff — privacy notice, data-use page and ToS rewrite (LAM-2028)

**Status: unreviewed drafts. Nothing on this list has been cleared by counsel. Do not publish the
pages without a legal review pass.**

Deliverables in this change:

- `frontend/app/policies/privacy/page.tsx` — full replacement, Part A (controller) / Part B (processor).
- `frontend/app/policies/data-use/page.tsx` — new plain-English data-use summary.
- `frontend/app/policies/terms/page.tsx` — new §20, Customer Data and model improvement.
- Workspace-level Privacy Mode toggle, on by default.

Every factual claim in the drafts traces to a code-level inventory. Where the code did not answer the
question, the drafts say the answer is being confirmed rather than guessing. This document lists what
counsel must decide and what engineering must confirm.

## 1. Out of scope, must be resolved before or alongside publication

### 1.1 DPA rider against Common Paper v1.1 — blocking for enterprise customers

Not drafted here, deliberately. This is the gap that matters most.

The new ToS §20 grants a revocable training licence with a Privacy Mode carve-out. For every customer
on our Common Paper v1.1 DPA, that DPA is the customer's documented Art. 28(3)(a) processing
instruction and it **overrides the new ToS section**. Processing Customer Data for model improvement
is not within the instruction the DPA gives us, so for those customers turning Privacy Mode off does
not by itself make training lawful — we would be processing outside our instructions regardless of
what the ToS says.

A rider is required that:

- adds model improvement as a permitted processing purpose, conditioned on Privacy Mode being off;
- records the Privacy Mode setting as the mechanism by which the controller gives and withdraws that
  instruction;
- carries the prospective-only limitation from ToS §20.5 into the DPA, so the controller cannot read
  an erasure obligation into it that we cannot perform;
- carries the mandatory-redaction commitment from ToS §20.6;
- reconciles the subprocessor list and notice mechanism with §B.4 of the privacy notice.

Until the rider is executed, the safe operational position is that **enterprise customers on the
existing DPA are not eligible to have Privacy Mode off**, whatever the UI allows. Engineering should
be told whether to gate the toggle for those workspaces.

### 1.2 §15 of the old notice named the CEO as DPO — Art. 38(6) conflict

The prior notice designated the CEO as Data Protection Officer. Where a DPO appointment is required,
Art. 38(6) prohibits tasks that create a conflict of interest, and a CEO determining the purposes and
means of processing is the textbook conflict. Two further problems in the same section:

- the stated DPO postal address was San Francisco while the named individual is in London;
- a US-established controller processing EEA/UK personal data may need an Art. 27 representative,
  which is a different role from a DPO and cannot be satisfied by the same designation.

Counsel to decide: (a) whether a DPO is required at all on our processing profile, (b) who holds it if
so, (c) whether an Art. 27 representative is required for the EEA and separately for the UK, and (d)
the correct published address for each.

Both drafts currently avoid asserting any of this. The privacy notice says the data protection contact
details, DPO appointment and Art. 27 representative "are being confirmed and will be published here."
That placeholder must be resolved before publication.

### 1.3 ToS §11 arbitration forum is template residue

§11 refers disputes to the "International Commercial Arbitration Court under the European Arbitration
Chamber (Belgium, Brussels)" with a seat in Delaware and Delaware substantive law. This is
boilerplate that survived from the template. The named institution paired with a Delaware seat is
incoherent and plausibly unenforceable, and it sits oddly against §10, which gives Delaware courts
exclusive jurisdiction. Not touched in this change because rewriting a dispute-resolution clause is
counsel's call, not a drafting cleanup. Needs replacement with a forum we actually intend.

## 2. Substantive positions counsel should confirm in the drafts

1. **Art. 14, not Art. 13, for end-user data in traces.** Part B states that Customer Data reaches us
   from the customer's systems rather than from the data subject, that the customer's Art. 14
   obligations are the customer's own, and that we will not act on an end-user request received
   directly. Confirm the referral-not-action posture is what we want.
2. **Sensitive data in Part B.** The old notice asserted across the summary, §1 and CCPA category L
   that no sensitive personal information is processed. That was false for trace content. The draft now
   says trace content can contain Art. 9 / sensitive data, that we do not seek it, and that we do not
   undertake to identify or specially handle it absent written agreement. Confirm the disclaimer is
   strong enough and does not itself create an expectation.
3. **Retention.** The draft says plainly that plan retention windows are access controls rather than
   deletion, and that stored data has no default expiry. This is accurate and unflattering. Confirm we
   publish it as written; the alternative is to change the product so retention actually deletes.
4. **Deletion gaps.** The draft discloses that project deletion does not reach the search index or
   object storage, and that single-trace deletion reaches only the primary span store. Confirm
   disclosure now versus fixing first and disclosing the fixed behaviour.
5. **Irreversibility language.** ToS §20.5 is in capitals and states that weights cannot be reversed.
   Confirm the framing survives an unfair-terms read in the EU/UK, and that it does not conflict with
   any erasure commitment elsewhere.
6. **Default-on Privacy Mode as consent architecture.** Turning Privacy Mode off is an affirmative act
   by a workspace owner. Confirm that a workspace owner's action is the right authority level, given
   the controller is the customer entity and the owner may not be the person who signed the DPA.
7. **Notice-of-change clause.** The draft commits that a change expanding training use "will not be
   applied to a workspace without a fresh choice by that workspace." That is a real constraint on
   future changes. Confirm we want to be bound to it.
8. **Sentry and incidental content.** Both Part A and Part B disclose that error reports may
   incidentally contain fragments of the data a failing request was handling, and that server-side
   reports are configured to include request-identifying information. Confirm, and see item 3.7 below.

## 3. Open items for engineering — every UNKNOWN from the audit

These are unresolved facts. Each one is currently either absent from the drafts or covered by a
"being confirmed" placeholder. They are listed so nothing silently becomes a published claim.

### 3.1 Backups
No code evidence of backup retention or purge schedule for Postgres, ClickHouse or S3. Both Part A
and Part B say the schedule "is being documented and will be stated here." A notice that claims
deletion needs an answer here.

### 3.2 Third-party retention periods
PostHog and Sentry retention are configured in each provider's console, not in our code. Part A.6 says
so and defers. Someone needs to read the consoles and supply the numbers.

### 3.3 Object storage
- No `PutObject` path exists in either repo — only reads. **Which component uploads span payloads is
  unknown.** If it is the SDK or collector, the data-flow description in Part B.1 may be incomplete.
- No bucket lifecycle or expiry rule anywhere in the repos. Unknown whether one is configured
  out-of-band on the real buckets.
- No delete method exists in the storage abstraction at all, which is why project deletion cannot
  purge objects.

### 3.4 ClickHouse deletion semantics
Project deletion issues `ALTER TABLE ... DELETE`, a ClickHouse mutation. `mutations_sync` is not set,
so the command returns before parts are rewritten. Unknown whether the purge is physically complete
when the request returns, and what the erasure SLA is once a mutation is accepted. Part B.5 describes
these as asynchronous rather than claiming immediacy.

### 3.5 Deletion coverage gaps to confirm and fix
- `evaluator_scores` carries `project_id` but is absent from the project-deletion table list — rows
  appear to survive project deletion.
- The `signal_event_clusters_768` shadow table left behind by a migration exchange is not purged.
- Quickwit has no delete path at all; indexed content ages out only under the 90-day index retention
  policy. Note that the migration runner skips existing indexes, so a retention change never applies
  to an already-created index — confirm the 90 days is actually in force on production indexes.
- Several project-scoped Redis keys are not evicted on project deletion and expire only by TTL; the
  TTLs are unconfirmed.
- Unknown whether a single-project workspace is actually deletable, given `deleteProject` refuses to
  delete a workspace's only project while `deleteWorkspace` deletes projects concurrently. Needs a
  test before we claim workspace deletion works.
- `deleteWorkspace` uses `Promise.all`, so one failing project delete short-circuits and leaves a
  partially deleted workspace with no automatic repair.

### 3.6 Account deletion
There is no self-serve account deletion; Better Auth's `deleteUser` is not enabled and no route
exists. Part A.7 states this plainly and gives an email route. Also unresolved: what should happen to
a workspace whose sole owner leaves or is deleted. `removeUserFromWorkspace` currently lets a sole
owner remove themselves and orphan the workspace.

### 3.7 Redaction — label set and coverage
- **The shipped entity label set is unknown.** No `id2label` ships in the repo; labels are read at
  runtime from whatever model config is mounted. The default is a build-arg pinned to a HuggingFace
  revision whose 8 category names are never enumerated in the repo. The drafts therefore make **no
  claim** about which categories are detected — in particular they do not claim SSN, credit card,
  address or API key coverage. Read the pinned config before any such claim is added.
- Labels and weights are per-deployment configurable, so no coverage claim holds across deployments.
- Redaction does not cover span attributes, span events, span names, trace metadata, the trace-level
  input/output previews, extracted trace input/output, evaluation and dataset data, labelling queue
  items, session recordings, or object-storage payloads. Part B.7 lists these.
- It is best-effort and fails open: on gRPC error, timeout, or oversize payload the span is stored
  unredacted. Long payloads are the common case for that failure mode.
- Unredacted content sits in the durable ingestion queue until consumed; the queue has no message TTL.
- The trace-level rollup is computed **before** redaction runs, so unredacted truncated previews reach
  Postgres, ClickHouse and the realtime stream. This is the largest single coverage gap and is the one
  most likely to undercut the ToS §20.6 commitment if the training corpus is built from trace rows
  rather than span rows. **Engineering must confirm which tables feed the training corpus.**
- A doc comment in the redactor contradicts the code on whether tool definitions are walked; the code
  redacts them. Worth fixing so the next reader is not misled.

### 3.8 Self-tracing export
`INTERNAL_TRACING_HTTP_URL` / `_API_KEY` in the private repo export our own self-tracing spans over
OTLP to an arbitrary Laminar instance. Those spans can embed prompt and span text. Unknown whether
cloud sets these. If it does, it is a Customer Data flow that the subprocessor table does not yet
describe.

### 3.9 Manifest-only vendors
`@mux/mux-player-react` is a dependency and `*.mux.com` is allowed in the CSP, but no usage was found.
The CSP also permits unpkg, esm.sh, gstatic and youtube-nocookie with no call sites found. None are
named in the drafts. Confirm they are dead and remove them, or confirm they are live and add them.

### 3.10 International transfer mechanisms
Part A.5 does not assert a specific Art. 46 mechanism for any recipient, because none is evidenced in
the repo. Counsel and ops need to establish which recipients are covered by SCCs, the UK IDTA, or the
EU-US Data Privacy Framework, and the notice should then name them.

### 3.11 Session and verification row cleanup
No scheduled job removes expired `sessions`, `verifications` or `device_codes` rows. Part A.6 discloses
that expired records may persist. Either add a cleanup job or leave the disclosure as written.

### 3.12 PostHog identifier is an email address
The analytics distinct ID for a signed-in user is their email address, not an opaque ID. Part A
discloses it. Worth a decision on whether to change it, since it makes the analytics store a personal
data store keyed on a direct identifier.

## 4. Notes on what was deliberately not done

- The DPA rider was not drafted, per instruction.
- The cookie notice was not revised; its tracker table has not been reconciled against the actual
  analytics configuration. It carries an unreviewed-draft header flagging this.
- The inherited ToS sections other than the new §20 were not rewritten. §11 is flagged above; there are
  likely other template artefacts (for example §5, which says the Services do not accept user content,
  which is inaccurate for a platform whose entire function is ingesting customer content).
- No subprocessor, retention period or data category was invented. Where the audit returned UNKNOWN,
  the drafts defer rather than fill the gap.
