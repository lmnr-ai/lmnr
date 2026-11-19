# Eval datasets (versioned Harbor task folders, `/v1/eval-datasets/*`)

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

`lmnr-cli eval dataset pull / push` and `eval run` sync the task folders of a Harbor dataset (`evals/<dataset>/tasks/<task>/`) with Laminar (LAM-2562). A task version is a content hash the CLI computes (`lmnr-ts` `packages/lmnr-cli`); `tasks.toml` pins one hash per task. The server stores versions and pins, nothing else: it never unpacks an archive and never checks a hash against its content (like layer `diff_id`s in `hosted-evals.md`, a wrong hash only corrupts the uploader's own project).

## Shape

- `app-server/src/eval_datasets/mod.rs`: name and hash rules, S3 key builders, the push transaction and its pure checks (`check_push`, `has_moved`, `latest`, unit-tested). `db/eval_datasets.rs`: the queries. Routes: `api/v1/eval_datasets.rs`, CLI twins `api/v1/cli/eval_datasets.rs` (every route, only the extractor differs).
- Streamed bodies, the index check and `upstream_error` are shared with hosted evals through `api/v1/payload.rs`.
- Postgres (migration `0134`): `datasets_v2 (project_id, id)`, `tasks (project_id, dataset_id, id)`, `task_versions (project_id, dataset_id, task_id, hash, created_at)`. Ids are the names. `evaluations.dataset_v2_id` has no FK: a local run of an unpushed dataset still records its name.
- ClickHouse (migration `87`): `evaluation_datapoints.task_version_hash` (`''` when unknown), exposed in `evaluation_datapoints_v0` and the SQL editor's `evaluation_trials`.
- Storage: `S3_EXPORTS_BUCKET`, gated on `Feature::Storage` only (no Daytona / hosted evals needed). Without it every route answers `501 {code: "storage_not_configured"}`.

## Routes

All under `/v1/eval-datasets/{dataset}` (project key) and `/v1/cli/eval-datasets/{dataset}` (CLI token). Errors are `{error, code}`; clients branch on `code`. Path names are checked first (`400 invalid_name` / `invalid_hash`).

| Route | What |
|---|---|
| `GET /` | `{id, createdAt, tasks: [{id, hash, createdAt}]}`: each task's latest version, tasks by id bytewise (`COLLATE "C"`). `404 dataset_not_found`. |
| `POST /versions/missing` | `{versions: [{task, hash}]}` (≤ 10000) → `{missing}`, in request order. A missing dataset → all missing. |
| `PUT /tasks/{task}/versions/{hash}` | Archive body (`pack.ts` output, 1 GiB cap), streamed to S3 → `204`. No Postgres write. |
| `PUT /tasks/{task}/versions/{hash}/index` | `ArchiveIndex` JSON (64 MiB) → `204`. `404 archive_not_found` without the archive. Then upserts the dataset, task and version rows with `created_at = now`: **the version is now its task's latest**. |
| `GET /tasks/{task}/versions/{hash}` | The archive (`application/gzip`). `404 version_not_found` without a `task_versions` row (or a row whose object is gone). |
| `POST /push` | `{tasks: [{task, hash, base}]}` (1..=10000, each task once) → `{tasks: [{id, hash, createdAt}]}`. `409 versions_missing {missing}` / `409 moved {moved: [{task, latest}]}` and nothing written. |

## Invariants and gotchas

- **Latest** = the version with the greatest `created_at`, then the greatest hash. `created_at` means "last uploaded or pushed": the index upload and each push of a hash reset it.
- **Moved rule** (push, per task): `base` null → moved iff the task has any version other than `hash`; `base` set → moved iff `base` has no row, or a version other than `base` and `hash` is newer than `base`. `hash` is excluded because the pusher's own index upload already made it latest. `moved[].latest` names the newest version other than `hash` (the one that moved the pin), falling back to `hash`.
- **Push is one transaction:** `SELECT … FROM tasks … ORDER BY id COLLATE "C" FOR UPDATE` locks the affected tasks in one order, so overlapping pushes queue instead of deadlocking (40 concurrent opposite-order pushes: all `200`). A concurrent index upload of one of those tasks waits too: its `task_versions` insert takes `FOR KEY SHARE` on the task row through the FK.
- Timestamps are `statement_timestamp()`, not `now()`: `now()` is the transaction start, which precedes the lock wait, and a push that waited would then stamp its pins older than the version it waited for.
- **S3 keys:** `<project_id>/datasets/<dataset>/<task>/<hash>.tar.gz` and `.index.json`. Names allow only `[A-Za-z0-9._-]` starting with an alphanumeric, so no `/` or dot segment reaches a key. No lifecycle rule (unlike `hosted-evals/`): versions are kept forever.
- **Audit:** `POST /push` is `eval_dataset.update` with the dataset name as id and label (`audit::target_named`, before the checks, so 409s are logged as `error`). Every other route is `Skip` in `audit::middleware::classify`: uploads are per-item traffic of a push, reads are pull traffic (like hosted-evals uploads/downloads). `AuditResource::EvalDataset` is mirrored as `eval_dataset` in `frontend/lib/audit/events.ts`.
- **Datapoints:** `taskVersionHash` on `POST /v1/evals/{id}/datapoints` is stored only when it is a valid hash. A re-save of a Trial without one keeps the stored hash (`get_stored_trials` reads it with `created_at`), and `update_evaluation_trial`'s `INSERT … SELECT` copies it, so updates never blank it. `POST /v1/evals` rejects an invalid `datasetV2Id` with `400 invalid_name`.
- **Frontend lookups:** trial → dataset `evaluations.dataset_v2_id`, task `metadata.dataset_task`, hash `task_version_hash`; the version is found iff its `task_versions` row exists.

## Open questions (documented, not solved)

- No task (or dataset) deletion; a task removed from `tasks.toml` stays in Laminar with its versions.
- A re-push overwrites `created_at`: there is no push history.
- An upload counts as latest before the push call, so a concurrent uploader's unpushed version makes others' pushes `moved`.
- Local runs show no `agent/` or `logs/` in the trial file view.

## Testing locally

- moto as in `hosted-evals.md` → "Testing locally" (`AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://127.0.0.1:9100 S3_EXPORTS_BUCKET=<bucket>`); no `DAYTONA_API_KEY` needed. Unset `S3_EXPORTS_BUCKET` for the `501` path.
- The server doesn't validate archives, so any `.tar.gz` and `{"files": []}` exercise every route.
- CLI twins: mint a token as in `app-server.md` → "Local `/v1/cli/*` testing", plus `x-lmnr-project-id: <project>`.
- **The evaluation page needs the ClickHouse dictionaries** (`evaluations_dict`, ...), which the frontend creates at boot only with `CLICKHOUSE_POSTGRES_USER` / `_PASSWORD` set (plus `CLICKHOUSE_POSTGRES_HOST=postgres`, the compose service name as ClickHouse sees it). Without them the page errors with `Dictionary (evaluations_dict) not found`, which looks like a bug in whatever you are testing.
- **CLI end to end:** run `node packages/lmnr-cli/dist/index.cjs` from a scratch dir whose `.env` has `LMNR_PROJECT_API_KEY` + `LMNR_BASE_URL=http://localhost:8000`, with `LMNR_PROJECT_API_KEY` unset in the shell (the process env wins over `.env`). Two copies of the evals folder act as two teammates. `eval run` needs the plugin version the CLI pins (`LMNR_PYTHON_VERSION`); before it is on PyPI, `uv build --wheel -o /tmp/wheels` in lmnr-python and run with `UV_FIND_LINKS=/tmp/wheels`.
- **Remote runs** work with the recipe in `hosted-evals.md` → "Testing locally": quick tunnels for `crane registry serve` (`HOSTED_EVALS_REGISTRY_URL`), the app-server (`HOSTED_EVALS_LMNR_BASE_URL`) and a static server holding the `pnpm pack`ed CLI (`HOSTED_EVALS_CLI_PACKAGE`) and the plugin wheel; pass `--env UV_FIND_LINKS=<static tunnel>/` so the orchestrator's `uvx` finds the wheel. The run's upload index then shows which tasks were left out (Laminar has them) and the orchestrator downloads them.
