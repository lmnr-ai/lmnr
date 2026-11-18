# Eval datasets (versioned Harbor tasks)

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

An eval dataset is one folder under a repo's `evals/` (`harbor.yaml`, `agent/`, … plus `tasks/`). The setup stays in the repo; the tasks live in Laminar as immutable, numbered versions, and the repo pins one in a committed `lmnr.lock` (LAM-2555). `lmnr-cli eval push / pull / status` (lmnr-ts) is the only writer. Unrelated to the `datasets` (datapoints) feature.

## Shape

- **Postgres** (migration `0133_eval_datasets`): `eval_datasets (project_id, name)` unique; `eval_dataset_versions (dataset_id, version)` unique, with `parent_version`, `message`, `created_by_user_id` (the CLI user; null for project keys); `eval_dataset_version_tasks (version_id, name) → hash`; `eval_dataset_task_blobs (project_id, hash, size)`, one row per uploaded task.
- **S3**: `S3_EXPORTS_BUCKET`, keys `eval-datasets/<project_id>/tasks/<64 hex>.tar.gz` and `.index.json`. The archive is lmnr-cli `packFiles` output for one task dir (paths relative to it); the index is the same `ArchiveIndex` JSON as hosted-evals uploads, so `frontend/lib/actions/evaluation/files.ts` reads single files from it. No lifecycle rule may expire this prefix (versions reference blobs forever).
- **Code**: `app-server/src/eval_datasets/mod.rs` (name/hash rules, keys, `create_version`), `db/eval_datasets.rs` (SQL), `api/v1/eval_datasets.rs` (routes + shared `handle_*`), `api/v1/cli/eval_datasets.rs` (CLI twins). Streaming bodies, body caps, index parsing and the generic 502 are `api/uploads.rs`, shared with hosted evals.
- **Gate**: `Feature::Storage` + `S3_EXPORTS_BUCKET` only (`eval_datasets::bucket()`); not hosted evals / Daytona. Without it every route answers `404 {error: "Eval datasets need S3 storage on this deployment"}`.

## Routes

Each exists under `/v1` (project key) and `/v1/cli` (`CliProjectAuth`). Errors are `{error}` JSON; S3 failures are `502 "Eval dataset <operation> failed upstream. Retry shortly."` with the cause logged. JSON bodies are read raw (64 MiB cap) and parsed with serde, so malformed JSON is a `400 {error}` rather than actix's plain-text one, and a 100k-task push isn't stopped by the 5 MiB `HTTP_PAYLOAD_LIMIT`.

| Route | What |
|---|---|
| `POST /eval-dataset-tasks/missing` | `{hashes}` (≤ 10000, deduped) → `{missing}` in input order: hashes with no blob row in the project. |
| `PUT /eval-dataset-tasks/{hash}` | Raw `.tar.gz` (512 MiB) streamed to S3 → `204`. Writes no row. |
| `PUT /eval-dataset-tasks/{hash}/index` | Index JSON (64 MiB) → `204`; `404` without the archive; then upserts the blob row (`size` = sum of file sizes). The row is written last, so a half-uploaded task stays "missing". |
| `GET /eval-dataset-tasks/{hash}` | `application/gzip` stream; `404` unless the project has the blob row. |
| `GET /eval-datasets` | `[{id, name, createdAt, latestVersion}]`, `ORDER BY lower(name), name`. |
| `GET /eval-datasets/{name}/versions/{n \| latest}` | `{datasetId, dataset, version, parentVersion, message, createdAt, tasks: {name: hash}}`; `400` for a version that isn't a positive integer or `latest`. |
| `POST /eval-datasets/{name}/versions` | `{parentVersion?, message?, tasks}` (≤ 100000, may be empty) → `201 {datasetId, dataset, version, previousLatest}`; `409 {error, missing}`; `400` for bad names/hashes or a parent not in this dataset. |

## Invariants and gotchas

- **Names** `^[A-Za-z0-9][A-Za-z0-9._-]*$` (dataset ≤ 100, task ≤ 255 bytes); **hashes** `^sha256:[0-9a-f]{64}$`. The hash goes into S3 keys, so nothing else may pass `is_task_hash`. The server never recomputes it: lmnr-cli (`tasks.ts`) hashes the task's sorted `<mode> <content sha256> <path>` lines, and the server stores it opaque. A wrong hash only mislabels a blob in the uploader's own project.
- **Blobs are per project.** Another project's hash is "missing" and its archive `404`s even though the bytes are in the same bucket; keys are built from the caller's project.
- **Version numbering**: `create_version` checks blobs, then in one transaction upserts the dataset (`ON CONFLICT … DO UPDATE` takes the row lock, which serializes concurrent pushes of one dataset), checks the parent, and inserts `max(version) + 1`. A unique violation retries (3 attempts). 10 concurrent pushes got versions 4–13 with no retry. A rejected push (409/400) rolls back, so a first push that fails creates no dataset. `parentVersion` is any existing version, not necessarily the latest (branches); `previousLatest` lets the CLI warn.
- **Audit**: only `POST …/versions` is logged (`eval_dataset.create`, target = dataset id + name, `metadata.version`). Task uploads, `missing` and reads are `Skip` in `audit::middleware::classify` (per-item traffic and config reads). `eval_dataset` is in both `AuditResource` and `frontend/lib/audit/events.ts`.
- Nothing deletes datasets, versions or blobs yet; project deletion cascades the rows but leaves the S3 objects. Data Plane is not covered.

## UI (frontend, read-only)

- **Pages** (`app/(auth)/(app)/project/[projectId]/eval-datasets/`, components `components/eval-datasets/`): the list (`list/`: name, tasks, updated = the newest task version's `created_at`, else the dataset's) and a dataset (`dataset/`): its tasks at their latest version (`dataset/tasks/`: name, latest hash short, version count, updated; `?search=` server-side ILIKE) beside the selected task (`dataset/task/`): its versions newest first (`created_at` DESC, `hash` DESC, the first marked latest) and the selected version's file tree and viewer (`task-files/FileBrowser`, shared with the trial Files view). "Eval datasets" (beta) sits under Evaluations in the sidebar, apart from Datasets. Both tables are `InfiniteDataTable`s without saved views, keyed by name (`uniqueKey="name"`: rows have no `id`). URLs use the dataset NAME, which the name rule keeps URL-safe. The header's Evaluations button opens the evaluations page with `?groupId=<dataset>` (lmnr-cli reports a dataset's runs to a group named after it; the list can't filter by `dataset_v2_id`).
- **Page state is nuqs**: `?task=`, `?version=<hash>` (the latest when unset or not one of the task's; cleared when the task changes) and `?file=` (kept across tasks and versions that have it, else `instruction.md`, else the first file).
- **Reads Postgres and S3 directly**, not the app-server routes: `lib/actions/eval-datasets/` (`index.ts` queries, `files.ts` version archives through the evaluation files reader, `storage.ts` `findTaskVersionPrefix` (also used by the trial Files view, `hosted-evals.md`), `types.ts` the client-safe surface: name/hash rules, `shortHash`). API routes: `/api/projects/[projectId]/eval-datasets` (the list), then under it `[datasetName]/tasks`, `[datasetName]/tasks/[taskName]/versions` and `.../versions/[hash]/files[/content?path=]`. A version's files 404 unless its `task_versions` row is in the caller's project (names and hash are validated before they go into the key). Project scoping is the usual pair: `proxy.ts` membership check for `/api/projects/[projectId]`, `requireProjectAccess` in the project layout, plus `project_id` in every query.
- **Trials link back to versions**: an evaluation's `dataset_v2_id` plus a datapoint's `task_version_hash` name the version its trial Files view shows as `task/` (`hosted-evals.md` → "Trial Files view"); local runs of a pushed dataset get a Files view this way too.
- **Seeding the trial side by hand** (no CLI or SDK): insert `evaluations` rows with `dataset_v2_id` (+ `hosted_metadata` for a remote run), `evaluation_datapoints` rows with `task_version_hash`, and `traces_agg` / `traces_static` rows for their `trace_id` (status stays "pending" without a root span id). Write `scores` / `metadata` as compact JSON (`{"reward":1}`): the score columns use `simpleJSONExtractFloat`, which reads `{"reward": 1}` as 0.

## Testing locally

- moto as in `hosted-evals.md` → "Testing locally" (`uvx --from 'moto[server]' moto_server -p 9100`, `curl -X PUT http://127.0.0.1:9100/<bucket>` creates the bucket), app-server with `AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://127.0.0.1:9100 S3_EXPORTS_BUCKET=<bucket>`. No `DAYTONA_API_KEY` needed. Unset `AWS_BEARER_TOKEN_BEDROCK` if the sandbox exports it.
- A project key can be inserted directly: `project_api_keys.hash` is the hex SHA3-256 of the key value (`project_api_keys::hash_api_key`). CLI routes need a JWT (`app-server.md` → "Local `/v1/cli/*` testing") and `x-lmnr-project-id`.
- A second app-server on other ports (`PORT=8010 GRPC_PORT=8011 CONSUMER_PORT=8012`) without the `AWS_*` vars checks the storage-off `404`s without stopping the main one.
- Seeding the UI without the CLI: pack task dirs with lmnr-cli's own `hashTaskDir` / `packTask` (`/repos/lmnr-ts/packages/lmnr-cli/src/commands/eval/tasks.ts`, run a `.mts` script with lmnr-ts's `tsx`; a `.ts` one fails on top-level await), insert the four tables' rows with psql, and upload with boto3 (`uvx --with boto3 python`). Plain `curl -X PUT --data-binary` to moto stores an EMPTY object unless it sends `Content-Type: application/octet-stream` (curl's default form type makes moto's Werkzeug eat the body), and unsigned GETs answer 403.
