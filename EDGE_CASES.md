# LAM-2107 — Signals from the CLI: edge cases

Every case below was executed against a live local stack (app-server on `:8000`,
frontend on `:3000`, staging Postgres + ClickHouse) using the **real built CLI**
(`packages/lmnr-cli/dist/index.cjs`) where the case is CLI-observable, and raw
HTTP against `/v1/cli/signals` where the case is about the endpoint contract
(status codes, auth, headers, wire-shape).

**Result: 88 / 88 pass**, twice in a row (the runner is idempotent — it deletes
its own fixtures on entry).

Runner: `/tmp/edge-cases-run.sh` (sandbox-local, not committed — it hardcodes a
sandbox project id and a scratch credentials dir).

Legend for "Where": **CLI** = through the built CLI binary; **HTTP** = direct
request; **DB** = asserted by querying Postgres afterwards.

---

## A. Auth and project scoping

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| A1 | No `Authorization` header | 401 | HTTP | PASS |
| A2 | Malformed / non-JWT bearer | 401 | HTTP | PASS |
| A3 | Valid JWT, **missing** `x-lmnr-project-id` | 400 `Missing x-lmnr-project-id header` (NOT 401 — the CLI must not think the session expired) | HTTP | PASS |
| A4 | `x-lmnr-project-id` not a UUID | 400 `Invalid x-lmnr-project-id header` | HTTP | PASS |
| A5 | Valid JWT, project the user is not a member of | 403 `User is not a member of this project` (NOT 401) | HTTP | PASS |

## B. Create — happy path parity with the UI drawer

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| B1 | Create with no `--trigger` | Seeds the UI's default trigger: `root_span_finished eq true` **if** `total_token_count gt 1000` | CLI | PASS |
| B2 | Auto-created alert | One `SIGNAL_EVENT` alert, `{"severities":[2],"skipSimilar":false}` | DB | PASS |
| B3 | Creator subscribed | One `EMAIL` alert target = the signed-in user's email | DB | PASS |
| B4 | Clean metadata | `metadata` is `{}` — no sampling, no `disabled` key | DB | PASS |
| B5 | Clustering OFF (`CLUSTERING_ENABLED` unset) | **No** `NEW_CLUSTER` alert, and `skipSimilar:false` (a true value would make the backend silently drop notifications) | DB | PASS |

## C. Create — names

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| C1 | Duplicate name in the same project | 409 `A signal named "X" already exists in this project` (unwrapped, not raw JSON) | CLI | PASS |
| C2 | Whitespace-only name | Rejected: `Signal name is required` | CLI | PASS |
| C3 | Unicode name (`ec-unicode-é`) | Accepted | CLI | PASS |
| C4 | 256-character name | Rejected: `at most 255 characters` | CLI | PASS |
| C5 | Exactly 255 characters | Accepted (limit counts CHARACTERS, not bytes) | CLI | PASS |
| C6 | Name with surrounding whitespace | Server **trims before storing** — otherwise `" Foo"` and `"Foo"` are distinct to the unique constraint and the derived alert reads `" Foo alert"` | HTTP | PASS |

## D. Prompt and payload schema

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| D1 | Whitespace-only prompt | Rejected: `Signal prompt is required` | CLI | PASS |
| D2 | `properties: {}` | Rejected: `at least one payload field` | CLI | PASS |
| D3 | Non-identifier field name (`1bad`) | Rejected — such fields are silently unsearchable/unsortable server-side | CLI | PASS |
| D4 | Malformed JSON in `--schema` | Rejected naming the flag: `--schema is not valid JSON` | CLI | PASS |
| D5 | `enum` on a non-string field | Rejected: `only allowed on string fields` | CLI | PASS |
| D6 | Partial `required` list | Rejected: `must list exactly the property names` (the UI marks every field required) | CLI | PASS |
| D7 | Unknown top-level schema key | Rejected: `unsupported top-level keys` | CLI | PASS |
| D8 | `type: "array"` sent straight to the API | 400 `structuredOutput.type must be "object"` — server re-validates, client validation is UX only | HTTP | PASS |

## E. The trigger split (LAM-2031) — the core of this change

`conditions` = **when** to evaluate (one span batch: `root_span_finished`,
`span_name`). `filters` = **whether** to run (whole trace:
`total_token_count`, `status`, `span_names`). A column in the wrong list would
silently never fire / never pass, so both directions are hard errors that name
the correct list.

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| E1 | Filter column inside `conditions` | Rejected: `"total_token_count" is a filter column — pass it in \`filters\`` | CLI | PASS |
| E2 | Condition column inside `filters` | Rejected: `"span_name" is a trigger condition column — pass it in \`conditions\`` | CLI | PASS |
| E3 | Same, bypassing the CLI | 400 with the same guidance | HTTP | PASS |
| E4 | Empty `conditions` | Rejected: `non-empty "conditions"` — an empty list never fires | CLI | PASS |
| E5 | Empty `conditions` via API | 400 `A trigger must have at least one condition` | HTTP | PASS |
| E6 | `--no-default-trigger` | Creates the signal with 0 triggers and **says so**: "none — this signal will never fire" | CLI | PASS |
| E7 | Same, in the DB | Zero `signal_triggers` rows | DB | PASS |
| E8 | `--no-default-trigger` + `--trigger` | Rejected as contradictory | CLI | PASS |

## F. Per-column value rules

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| F1 | `root_span_finished` with JSON `true` | Rejected — the evaluator compares the **string** `"true"`, so a boolean would never match | CLI | PASS |
| F2 | Multiple `span_name`s with `eq` | Rejected: must use `includes` (eq/ne are scalar) | CLI | PASS |
| F3 | `span_name` list that is all blanks | Rejected: `at least one non-blank span name` | CLI | PASS |
| F4 | `total_token_count` = `"NaN"` | Rejected: `finite number` (Rust's `parse::<f64>` accepts NaN/inf; a NaN threshold makes every comparison false) | CLI | PASS |
| F5 | `status` = `"OK"` | Rejected: must be `"error"` or `"success"` (the only values `has_error` can produce) | CLI | PASS |
| F6 | `span_names` = `"   "` | Rejected — a blank target matches **everything** under `ne` | CLI | PASS |
| F7 | `mode: 5` | Rejected: must be 0 or 1 (anything else falls outside both evaluator paths) | CLI | PASS |
| F8 | `total_token_count` = `"  1000  "` | Server **trims before storing** → `"1000"`; its evaluator's parse does not trim, so an untrimmed value would compare false forever | HTTP + DB | PASS |
| F9 | Misspelled trigger key (`filter` vs `filters`) | Rejected: `unsupported keys: filter` — a silent drop would lose every filter | CLI | PASS |

## G. Sampling and disabled

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| G1 | `--sample-rate 96` | Rejected: `between 1 and 95` | CLI | PASS |
| G2 | `--sample-rate 0` | Rejected | CLI | PASS |
| G3 | `sampleRate: 200` via API | 400 — server enforces the same range | HTTP | PASS |
| G4 | `--sample-rate 25` | Stored as `{"sampleRate":25}` | DB | PASS |
| G5 | `--disabled` | Stored as `{"disabled":true}` (persisted **only** when true; absence means active) | DB | PASS |

## H. Update — partial-patch semantics

The whole point: an omitted flag must leave the stored value alone.

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| H1 | `--prompt` only, on a 25%-sampled signal | `sampleRate` **preserved** at 25 | CLI + DB | PASS |
| H2 | `--prompt` only, on a disabled signal | Stays disabled (does not silently reactivate) | CLI + DB | PASS |
| H3 | `--no-sampling` | `sampleRate` key **removed** (not set to null/0) | CLI + DB | PASS |
| H4 | `--no-disabled` | `disabled` key **removed** | CLI + DB | PASS |
| H5 | Unknown metadata key present (`futureKey`) | Survives an update — the merge preserves keys it doesn't model | DB | PASS |
| H6 | `update` with no flags | Rejected: `Nothing to update` + the list of valid flags (not a silent no-op) | CLI | PASS |
| H7 | `--sample-rate` + `--no-sampling` | Rejected as contradictory | CLI | PASS |
| H8 | **Absent** `sampleRate` on the wire | Stored value preserved (40 → 40) | HTTP | PASS |
| H9 | **Explicit `null`** `sampleRate` | Cleared → `null`. Distinguishing absent from null is why the field is a double-`Option` server-side | HTTP | PASS |
| H10 | `--trigger` replaces the set | Exactly 1 trigger row afterwards (no accumulation) | DB | PASS |
| H11 | Same | The stored condition is the new `span_name includes` one | DB | PASS |
| H12 | Update with an invalid trigger | 400 naming the right list | HTTP | PASS |
| H13 | After that rejection | The **old** trigger is intact — triggers are validated before anything is written, so a bad patch applies nothing | DB | PASS |
| H14 | `triggers: []` | Clears every trigger (0 rows) — explicit and distinct from omitting the key | HTTP + DB | PASS |
| H15 | Update a non-existent signal id | 404 `Signal not found` (not 500) | HTTP | PASS |
| H16 | Update with a non-UUID id | 4xx, not a 500 | HTTP | PASS |

## I. Reference resolution (id or name)

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| I1 | `get <uuid>` | Resolves directly | CLI | PASS |
| I2 | `get <exact name>` | Resolves; an exact match wins over substring matches | CLI | PASS |
| I3 | Ambiguous substring (`ec-`) | **Error listing the candidates**, not a silent pick — update/delete are destructive | CLI | PASS |
| I4 | Name that matches nothing | `No signal matching "..." in this project.` | CLI | PASS |
| I5 | `list <name>` | Case-insensitive substring filter | CLI | PASS |

## J. Cross-project isolation

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| J1 | PATCH signal A while sending project B's header | 404 `Signal not found` — every query is project-scoped | HTTP | PASS |
| J2 | DELETE signal A as project B | 404 | HTTP | PASS |
| J3 | After both attempts | Signal A still exists (no cross-project write) | DB | PASS |
| J4 | `list` under project B | Signal A absent (no cross-project read) | CLI | PASS |

## K. Delete

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| K1 | Delete a signal | `signals` row gone | DB | PASS |
| K2 | Its triggers | `signal_triggers` rows gone — **see the bug note below** | DB | PASS |
| K3 | Its alerts | `alerts` rows gone (`alerts.source_id` has no FK, so this is explicit) | DB | PASS |
| K4 | Its alert targets | `alert_targets` rows gone (these DO cascade from `alerts`) | DB | PASS |
| K5 | Re-delete the same id | 404 `Signal not found` (idempotent, no 500) | HTTP | PASS |
| K6 | Delete by a now-gone name | `No signal matching ...` | CLI | PASS |

### Bug found and fixed during this work

`signal_triggers` has **no foreign key on `signal_id` at all** (verified against
the live schema via `pg_constraint` — zero FK rows). I had assumed it cascaded;
the first delete test proved otherwise by leaving an orphan trigger row.
`delete_signal` now deletes triggers explicitly inside the same transaction.

**The frontend `deleteSignal` / `deleteSignals` path has the same gap** —
staging currently holds **8 orphan trigger rows** predating this work. I left
those rows alone (not mine to clean) but they are worth a follow-up: either add
the FK with `ON DELETE CASCADE` or mirror this explicit delete in the frontend
action.

### Write atomicity

A signal's row, its auto-created alerts, and its triggers are written in **one**
transaction (`create_signal_with_alerts`), and an update's metadata change plus a
trigger replacement share one transaction too (`update_signal`). This matters
because `signal_triggers` has no FK: a signal committed without its triggers is
silently inert *and* un-retryable, since re-creating it hits the unique-name 409.

For the same reason `delete_signal` takes the SAME `FOR UPDATE` lock on the
signals row **before** touching `signal_triggers`. A lock on only the update side
is not enough — with no FK, a delete that went straight for the child rows would
not block, so an in-flight replace could insert rows the delete had already
scanned past. Covered by M4 / M5 / M6.

## L. Output contract (agent-friendliness)

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| L1 | `get --json` | stdout starts with `{` | CLI | PASS |
| L2 | `get --json` shape | Carries `id`, `name`, `triggers` | CLI | PASS |
| L3 | `list --json` | stdout is a JSON array | CLI | PASS |
| L4 | `--json` stdout purity | Only JSON on stdout; all logging goes to stderr, so `... --json \| jq` works | CLI | PASS |
| L5 | `list` with no matches | Friendly `No signals found.` rather than an empty table | CLI | PASS |

---

## M. Review fixes (Bugbot on #2199)

Both issues were reproduced against the live server before fixing, and both are
now regression-covered here.

| # | Case | Expected | Where | Result |
|---|---|---|---|---|
| M1 | `?name=ec-under_score` with a sibling `ec-underXscore` | Matches **only** `ec-under_score` — `_` is a LIKE single-char wildcard, so unescaped it also matched the sibling | HTTP | PASS |
| M2 | `?name=%` | Matches **nothing** (a literal `%`), not every signal | HTTP | PASS |
| M3 | `?name=ec-under` | Plain substring search still matches both | HTTP | PASS |
| M4 | PATCH with `sampleRate: 77` **and** an invalid trigger | 400, and `sampleRate` stays at its prior 30 — the metadata half must not apply when the trigger half is rejected | HTTP + DB | PASS |
| M5 | Create | Signal + alert + trigger rows all present (one transaction) | DB | PASS |
| M6 | Concurrent trigger-replace + delete, 4 rounds | **Zero** orphan `signal_triggers` rows. `signal_triggers` has no FK, so both paths must lock the signals row FIRST — with the delete ordered triggers-first this reproduced 3/3 in raw SQL | HTTP + DB | PASS |

## Not covered (deliberate)

- **A signal actually firing end-to-end.** Trigger/filter *evaluation* is
  enterprise-only (`lmnr-private` `signals/private/evaluate.rs`) and needs a
  configured LLM provider plus real trace ingest. What is verified here is that
  the rows the CLI writes match byte-for-byte what the UI writes (§B, §F8), so
  the evaluator sees identical input from both surfaces.
- **ClickHouse event purge on delete.** The `signal_events` /
  `signal_event_clusters` / `events_to_clusters` purge runs after the Postgres
  commit and is best-effort by design (a CH hiccup must not block the delete).
  The test signals never produced events, so there was nothing to purge; the
  Postgres side of the cascade is asserted in §K.
- **Concurrent metadata updates to one signal.** The read-modify-write takes a
  `FOR UPDATE` row lock; two clients racing *the same metadata merge* isn't
  scripted. The update-vs-delete race that the missing FK made reachable **is**
  covered (M6).
- **`NEW_CLUSTER` alert creation.** Requires `CLUSTERING_ENABLED=true`, which is
  unset in this sandbox; §B5 asserts the correct clustering-off behaviour
  instead (no cluster alert, `skipSimilar:false`).
