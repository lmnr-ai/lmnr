# Eval datasets (versioned Harbor task folders, `/v1/eval-datasets/*`)

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

`lmnr-cli eval dataset pull / push` and `eval run` sync the task folders of a Harbor dataset (`evals/<dataset>/tasks/<task>/`) with Laminar (LAM-2562). Names follow Harbor: the dataset is `[dataset] name` in `<dataset>/tasks/dataset.toml`, each task `[task] name` in its `task.toml`, both `org/name` (the org is free text, not a Laminar entity). A task version is Harbor's own task content hash (`harbor.publisher.packager.Packager.compute_content_hash`), computed by the CLI (`lmnr-ts` `packages/lmnr-cli`); `dataset.toml` pins one per task as `[[tasks]] {name, digest = "sha256:<hex>"}`. **Versions are independent and Laminar has no "latest"**: which version a dataset uses is its pin, kept in the user's git (a merge of `dataset.toml` decides). The server stores versions, nothing else: it never unpacks an archive and never checks a hash against its content (like layer `diff_id`s in `hosted-evals.md`, a wrong hash only corrupts the uploader's own project).

## Shape

- `app-server/src/eval_datasets/mod.rs`: name and hash rules, S3 key builders (unit-tested). `db/eval_datasets.rs`: the queries. Routes: `api/v1/eval_datasets.rs` (with the `DatasetPath` / `VersionPath` extractors that join path segments into full names), CLI twins `api/v1/cli/eval_datasets.rs` (every route, only the extractor differs).
- Streamed bodies, the index check and `upstream_error` are shared with hosted evals through `api/v1/payload.rs`.
- Postgres (migration `0135`; its SQL is hand-kept because `drizzle-kit generate` renders an index column that has `.op()` without its `DESC NULLS FIRST`, so after regenerating restore `task_versions_created_at_idx` by hand): `datasets_v2 (project_id, id)`, `tasks (project_id, dataset_id, id)`, `task_versions (project_id, dataset_id, task_id, hash, created_at)`. Ids are the full `org/name` names. `evaluations.dataset_v2_id` has no FK: a local run of an unpushed dataset still records its name.
- ClickHouse (migration `87`): `evaluation_datapoints.task_version_hash` (`''` when unknown), exposed in `evaluation_datapoints_v0` and the SQL editor's `evaluation_trials`.
- Storage: `S3_EXPORTS_BUCKET`, gated on `Feature::Storage` only (no Daytona / hosted evals needed). Without it every route answers `501 {code: "storage_not_configured"}`.

## Names

Dataset and task names share one rule (`is_dataset_name` / `is_task_name`, mirrored by `isEvalName` in `frontend/lib/evaluation/trial-files.ts`): Harbor's `ORG_NAME_PATTERN`, two parts of `^[A-Za-z0-9][A-Za-z0-9._-]*$` joined by exactly one `/`, plus Harbor's check that the whole name has no `..`; at most 255 bytes. Hashes are 64 lowercase hex characters (the `sha256:` prefix of the pin is the CLI's business).

## Routes

All under `/v1/eval-datasets/{org}/{name}` (project key) and `/v1/cli/eval-datasets/{org}/{name}` (CLI token). The dataset takes two path segments and so does the task (`tasks/{task_org}/{task_name}`), so no slash is ever percent-encoded; the handlers join them (`org/name`) and validate the result, so everything below works on full names. Bodies and responses carry full `org/name` strings. Errors are `{error, code}`; clients branch on `code`. Path names are checked first (`400 invalid_name` / `invalid_hash`).

| Route | What |
|---|---|
| `POST /versions/missing` | `{versions: [{task, hash}]}` (≤ 10000) → `{missing}`, in request order. A missing dataset → all missing. |
| `PUT /tasks/{task_org}/{task_name}/versions/{hash}` | Archive body (`pack.ts` output, 1 GiB cap), streamed to S3 → `204`. No Postgres write. |
| `PUT /tasks/{task_org}/{task_name}/versions/{hash}/index` | `ArchiveIndex` JSON (64 MiB) → `204`. `404 archive_not_found` without the archive. Then inserts the dataset, task and version rows that don't exist yet (`ON CONFLICT DO NOTHING`): a re-upload keeps the version's `created_at`, its first upload. |
| `GET /tasks/{task_org}/{task_name}/versions/{hash}` | The archive (`application/gzip`). `404 version_not_found` without a `task_versions` row (or a row whose object is gone). |

## Invariants and gotchas

- **No latest, no push call.** A CLI push uploads the archive and index of each version Laminar lacks (`versions/missing`) and rewrites the pins in `dataset.toml` locally; a pull downloads the pinned versions. Comparing a task folder with its pin (same, a version Laminar has, or an edit) is the CLI's job (lmnr-ts `packages/lmnr-cli/src/commands/eval/AGENTS.md`). `created_at` = first upload, so the UI's `v1, v2, …` numbering (push order) never shifts.
- **S3 keys:** `<project_id>/datasets/<dataset>/<task>/<hash>.tar.gz` and `.index.json`. Each name is exactly two segments, neither empty nor a dot segment (the rule forbids `..` and a leading `.`), so a key always has the same 2 + 2 segments and distinct versions never share one. No lifecycle rule (unlike `hosted-evals/`): versions are kept forever.
- **Audit:** every route is `Skip` (`classify`, by the `/eval-datasets/` prefix): uploads and downloads are per-task traffic of a CLI push or pull, like hosted-evals uploads, and the pins that pick versions live in git, not Laminar.
- **Datapoints:** `taskVersionHash` on `POST /v1/evals/{id}/datapoints` is stored only when it is a valid hash. A re-save of a Trial without one keeps the stored hash (`get_stored_trials` reads it with `created_at`), and `update_evaluation_trial`'s `INSERT … SELECT` copies it, so updates never blank it. `POST /v1/evals` rejects an invalid `datasetV2Id` with `400 invalid_name`.
- **Frontend lookups:** trial → dataset `evaluations.dataset_v2_id`, task `metadata.dataset_task` (the task's full `org/name`), hash `task_version_hash`; the version is found iff its `task_versions` row exists. Pages and routes take each name as two segments too: `/project/[projectId]/eval-datasets/[org]/[name]` and `/api/projects/[projectId]/eval-datasets/[org]/[name]/tasks/[taskOrg]/[taskName]/versions/[hash]/files[/content?path=]`; links build them with `nameToPath`. Both tables paginate server-side (`InfiniteDataTable` + `useInfiniteScroll`, search and filters in SQL): `GET …/eval-datasets` and `…/[org]/[name]/tasks` (per task: `versionCount`, last pushed = newest `created_at`, created = oldest); a task's versions load only with its files dialog (`…/tasks/[taskOrg]/[taskName]/versions`, newest first, no "latest" label), which opens on the newest version when `?hash=` is absent.
- **Live trial status:** a row stops spinning once it has scores (`datapoint_upsert`) and its trace's `topSpanId` (`trace_update` on `evaluation_<id>`). `channels_for_trace_fields` (`app-server/src/traces/realtime.rs`) sends a trace there when its top span is named `evaluation` (the SDK's `evaluate()`) or has type `EVALUATION` (the Harbor plugin names it after the trial); by name alone, Harbor trials spun until a reload.
- **Evaluation ↔ dataset in the UI:** the evaluation header links to the run's eval dataset (`EvalDatasetLink`), only when its `datasets_v2` row exists (a run can name a dataset that was never pushed). There is no dataset → runs link: a run's group defaults to the dataset name but `lmnr-cli eval run --group` can change it, so a `groupId=<dataset>` link would miss runs; filtering evaluations by `dataset_v2_id` would be the way to add one. The trial Files tree starts with `agent/` and `logs/` collapsed (`initiallyCollapsed`); a folder holding the open file is always expanded (`expandTo`), so `?file=logs/...` links still show their file. A trial whose `task/` is a dataset version links to it from the Files header (`taskVersionHref`: the dataset page with `?task=&hash=`, which opens that version's dialog); a copy uploaded with a remote run has no link.

## Open questions (documented, not solved)

- No task (or dataset) deletion; a task removed from `dataset.toml` stays in Laminar with its versions.
- No record of who pushed a version, or when it was pushed again.
- Local runs show no `agent/` or `logs/` in the trial file view.

## Testing locally

- moto as in `hosted-evals.md` → "Testing locally" (`AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://127.0.0.1:9100 S3_EXPORTS_BUCKET=<bucket>`); no `DAYTONA_API_KEY` needed. Unset `S3_EXPORTS_BUCKET` for the `501` path.
- The server doesn't validate archives, so any `.tar.gz` and `{"files": []}` exercise every route.
- CLI twins: mint a token as in `app-server.md` → "Local `/v1/cli/*` testing", plus `x-lmnr-project-id: <project>`.
- **The evaluation page needs the ClickHouse dictionaries** (`evaluations_dict`, ...), which the frontend creates at boot only with `CLICKHOUSE_POSTGRES_USER` / `_PASSWORD` set (plus `CLICKHOUSE_POSTGRES_HOST=postgres`, the compose service name as ClickHouse sees it). Without them the page errors with `Dictionary (evaluations_dict) not found`, which looks like a bug in whatever you are testing.
- **CLI end to end:** run `node packages/lmnr-cli/dist/index.cjs` from a scratch dir whose `.env` has `LMNR_PROJECT_API_KEY` + `LMNR_BASE_URL=http://localhost:8000`, with `LMNR_PROJECT_API_KEY` unset in the shell (the process env wins over `.env`). Two copies of the evals folder act as two teammates. `eval run` needs the plugin version the CLI pins (`LMNR_PYTHON_VERSION`); before it is on PyPI, `uv build --wheel -o /tmp/wheels` in lmnr-python and run with `UV_FIND_LINKS=/tmp/wheels`. `uvx` reuses a cached environment while the version number is unchanged, so after rebuilding the wheel run `uv cache clean` (cleaning just `lmnr` is not enough), or trials silently keep the old plugin.
- **Remote runs** work with the recipe in `hosted-evals.md` → "Testing locally": quick tunnels for `crane registry serve` (`HOSTED_EVALS_REGISTRY_URL`), the app-server (`HOSTED_EVALS_LMNR_BASE_URL`) and a static server holding the `pnpm pack`ed CLI (`HOSTED_EVALS_CLI_PACKAGE`) and the plugin wheel; pass `--env UV_FIND_LINKS=<static tunnel>/` so the orchestrator's `uvx` finds the wheel. The run's upload index then shows which tasks were left out (Laminar has them) and the orchestrator downloads them.
