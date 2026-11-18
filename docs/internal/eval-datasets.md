# Eval datasets (Harbor tasks versioned by content hash)

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

An eval dataset is one folder `evals/<dataset>/` in a repo (`harbor.yaml`, `agent/`, … plus `tasks/`); its name is the folder name. The setup stays in the repo. The tasks live in Laminar, and each task is versioned on its own: a version is the content hash of the task folder, and every pushed version is kept. The dataset itself has no version. The repo pins one hash per task in a committed `tasks.toml` (LAM-2562). `lmnr-cli eval dataset push / pull` (lmnr-ts) is the only writer. Unrelated to the `datasets` (datapoints) feature.

## Shape

- **Postgres** (migration `0134_datasets_v2`): `datasets_v2 (project_id, id)`, where `id` is the dataset name; `tasks (project_id, dataset_id, id)`, where `id` is the task name; `task_versions (project_id, dataset_id, task_id, hash, created_at)`, PK over all four keys and indexed on `(project_id, dataset_id, task_id, created_at)`. Composite FKs cascade from the project down. Ids are names, so `project_id` is in every key.
- **Latest version** of a task is its `task_versions` row with the greatest `created_at`, tiebreak `hash DESC`. No column stores it.
- **S3**: `S3_EXPORTS_BUCKET`, keys `<project_id>/datasets/<dataset>/<task>/<hash>.tar.gz` and `.index.json` (`TaskVersion::archive_key` / `index_key`; the frontend builds the same keys). The archive is lmnr-cli `packFiles` output for one task dir (paths relative to it). The index is the same `ArchiveIndex` JSON as hosted-evals uploads, so `frontend/lib/actions/evaluation/files.ts` reads single files from it. No lifecycle rule may expire this prefix, because version rows reference the objects forever.
- **Evaluations**: `evaluations.dataset_v2_id` (text, no FK: a local run of an unpushed dataset still records it) is set from `POST /v1/evals` `datasetV2Id`. Each trial carries `taskVersionHash` into ClickHouse `evaluation_datapoints.task_version_hash` (CH migration `87`, also in `evaluation_datapoints_v0` and the SQL schema lists). Together with `task_id` they name the task version a trial ran.
- **Code**: `app-server/src/eval_datasets/mod.rs` (name/hash rules, `TaskVersion` keys, `push_tasks`), `db/eval_datasets.rs` (SQL), `api/v1/eval_datasets.rs` (routes + shared `handle_*`), `api/v1/cli/eval_datasets.rs` (CLI twins). Streaming bodies, body caps, index parsing and the generic 502 are in `api/uploads.rs`, shared with hosted evals.
- **Gate**: `Feature::Storage` + `S3_EXPORTS_BUCKET` only (`eval_datasets::bucket()`), not hosted evals or Daytona. Without it every route answers `404 {error: "Eval datasets need S3 storage on this deployment"}`.

## Routes

Each exists under `/v1` (project key) and `/v1/cli` (`CliProjectAuth`). Errors are `{error}` JSON. S3 failures are `502 "Eval dataset <operation> failed upstream. Retry shortly."` with the cause logged. JSON bodies are read raw (16 MiB cap) and parsed with serde, so malformed JSON is a `400 {error}` rather than actix's plain-text one. `{tasks: {<task>: <hash>}}` bodies keep input order (`IndexMap`), hold at most 10000 entries, and a bad name or hash anywhere is a `400`.

| Route | What |
|---|---|
| `GET /eval-datasets` | `[{name, createdAt, updatedAt, taskCount}]`, `ORDER BY lower(name), name`. `updatedAt` = newest version `created_at`, else the dataset's. |
| `GET /eval-datasets/{dataset}/tasks` | `{tasks: [{name, hash, createdAt}]}`: each task's latest version, by name. `404` for an unknown dataset. |
| `POST /eval-datasets/{dataset}/tasks/missing` | `{tasks}` → `{missing: [task]}` in input order: pairs with no version row. Pure read; an unknown dataset has everything missing. |
| `PUT /eval-datasets/{dataset}/tasks/{task}/versions/{hash}` | Raw `.tar.gz` (512 MiB) streamed to S3 → `204`. Writes no row. |
| `PUT …/versions/{hash}/index` | Index JSON (64 MiB, must parse as `ArchiveIndex`) → `204`; `404` without the archive. Then inserts the `datasets_v2`, `tasks` and `task_versions` rows in one transaction (`ON CONFLICT DO NOTHING`). |
| `POST /eval-datasets/{dataset}/tasks` | Push. `{tasks}` → `{tasks: [{name, hash, createdAt}]}` by name: sets `created_at = now()` on each given version row, so it becomes latest. `409 {error, missing}` (input order) if any pair has no row, and then nothing changes. |
| `GET …/versions/{hash}` | `application/gzip` stream of the archive; `404` unless the version row exists in the caller's project. |

## Invariants and gotchas

- **Names** `^[A-Za-z0-9][A-Za-z0-9._-]*$` (dataset ≤ 100, task ≤ 255 bytes). **Hashes** are bare `^[0-9a-f]{64}$`, with no `sha256:` prefix. All three go into S3 keys, so nothing else may pass `TaskVersion::validate`. The server never recomputes the hash. lmnr-cli hashes the task's sorted `<mode> <content sha256> <path>` lines, and the server stores it opaque. A wrong hash only mislabels a version in the uploader's own project.
- **A version row exists only once its archive and index are in S3**: the index route writes the row last, so a half-uploaded version stays "missing". The row is stamped `now()` on insert, so an uploaded version is its task's latest even before the push re-stamps it. A push that 409s after uploads therefore still moved "latest" for the uploaded tasks.
- **Push is a single `UPDATE … FROM unnest(…) RETURNING`** in a transaction that rolls back when fewer rows come back than were sent. Pushing an older hash again (a revert) re-stamps it, so it becomes latest again. Every row of one push gets the same `now()` (transaction start).
- **Everything is per project.** Another project's (dataset, task, hash) is "missing" and its archive `404`s, because keys and rows are built from the caller's project.
- **Trials**: an invalid or absent `taskVersionHash` stores `''`. `insert_evaluation_trials` reads each re-saved trial's stored row (`get_stored_trials`: first `created_at` and the latest non-empty hash), so a second save without a hash keeps the first one's. `update_evaluation_trial` copies `existing.task_version_hash`. An invalid `datasetV2Id` on `POST /v1/evals` is a `400`.
- **Deploy order**: CH migration `87` before the app-server, or every trial insert fails on the unknown `task_version_hash` column.
- **Audit**: only the push is logged (`eval_dataset.update`, target id and name = the dataset name, `metadata.taskCount`, plus `metadata.tasks` (`{task: hash}`) up to 100 tasks). Uploads, `missing` and reads are `Skip` in `audit::middleware::classify` (per-item traffic and config reads). `eval_dataset` is in both `AuditResource` and `frontend/lib/audit/events.ts`.
- Nothing deletes datasets, tasks or versions yet. Project deletion cascades the rows but leaves the S3 objects. Data Plane is not covered.

## Testing locally

- moto as in `hosted-evals.md` → "Testing locally" (`uvx --from 'moto[server]' moto_server -p 9100`, `curl -X PUT http://127.0.0.1:9100/<bucket>` creates the bucket), app-server with `AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=us-east-1 AWS_ENDPOINT_URL=http://127.0.0.1:9100 S3_EXPORTS_BUCKET=<bucket>`. No `DAYTONA_API_KEY` needed. Unset `AWS_BEARER_TOKEN_BEDROCK` if the sandbox exports it.
- A project key can be inserted directly: `project_api_keys.hash` is the hex SHA3-256 of the key value (`project_api_keys::hash_api_key`; `hashlib.sha3_256(key.encode()).hexdigest()`). An empty database needs a `workspaces` row and a `projects` row first (only `name` / `workspace_id` are required). CLI routes need a JWT (`app-server.md` → "Local `/v1/cli/*` testing") and `x-lmnr-project-id`.
- Any gzip body and `{"files": []}` are enough to exercise the routes: the server never opens the archive.
- Trial columns: `SELECT id, task_id, task_version_hash FROM evaluation_datapoints FINAL WHERE evaluation_id = '<id>'` over ClickHouse HTTP. A hand-applied CH migration must split on `;` after dropping `--` lines, because view comments contain semicolons.
- A second app-server on other ports (`PORT=8010 GRPC_PORT=8011 CONSUMER_PORT=8012`) without the `AWS_*` vars checks the storage-off `404`s without stopping the main one.
