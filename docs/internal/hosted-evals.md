# Hosted evals (Harbor runs in Daytona)

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

`app-server/src/hosted_evals/` runs a project's Harbor `evals/` folder in the cloud (LAM-2427). v0 is start-only: no run status, no evaluation id in the response.

## Flow

1. `POST /v1/hosted-evals/uploads` (project API key). The body is the raw `.tar.gz` of the `evals/` folder's *contents*, and the endpoint returns `{uploadId}`.
   - The app-server streams the body into `hosted-evals/<project_id>/<upload_id>.tar.gz` in `S3_EXPORTS_BUCKET` as an S3 multipart upload (`StorageTrait::upload_stream`, 8 MiB parts, capped at 2 GiB). There is no client-facing presigned URL.
   - `web::Payload` isn't limited by the global `HTTP_PAYLOAD_LIMIT`, but an ingress in front of the app-server (nginx `client_max_body_size`) must allow large bodies on this path.
   - `web::Payload` isn't `Send`, so the handler pumps it through an mpsc channel into the upload. An `Err` sent on that channel (client disconnect, empty body, over the cap) aborts the multipart upload, so a partial archive is never stored.
2. `POST /v1/hosted-evals/runs` with `{uploadId, datasets?, tasks?, nAttempts?, nConcurrent?, model?, env?}`. It HEADs the archive (400 if absent), presigns a GET, creates a Daytona sandbox on the default snapshot, waits for `started`, then runs the orchestrator command in a toolbox session with `runAsync`. Returns `202 {sandboxId}`.
3. The orchestrator (`orchestrator.py`, embedded with `include_str!` and passed as env `LMNR_EVAL_SCRIPT`, params as JSON in `LMNR_EVAL_RUN`) downloads and extracts the archive. For each suite (an archive-root dir with `harbor.yaml`, a Harbor JobConfig) it writes an overridden config and runs `harbor run -c … --plugin laminar --pk group_name=<suite>` with trials on Daytona. The sandbox then deletes itself.

## Invariants and gotchas

- **Routes live under `/hosted-evals`, not `/evals/…`**: `POST /v1/evals/{eval_id}` (update eval) would capture `POST /v1/evals/runs`.
- **Each run reports with its own short-lived key, never a user-facing one.**
  - `start_run` mints a full (non-ingest-only) project key named `lmnr-internal-evals-<UTC timestamp>` (`RUN_KEY_NAME_PREFIX`) that expires after `HOSTED_EVALS_MAX_RUN_MINUTES`, the same as the sandbox TTL. It's passed in as `LMNR_PROJECT_API_KEY`, and the plugin needs a full key for `/v1/evals`.
  - The key is deleted if the launch fails. Otherwise nothing revokes it when the run ends: it expires, and the app-server purges the row the next time it's presented.
  - `getApiKeys` in `frontend/lib/actions/project-api-keys` hides the prefix, so keep the two constants in sync.
  - `project_api_keys::generate_api_key` uses the same format as the frontend's `createProjectApiKey`.
- **The same `DAYTONA_API_KEY` goes into the sandbox** (Harbor's `-e daytona` needs it), and user eval code can read it. Use a dedicated Daytona org with a spend limit. Never add other secrets to the sandbox env.
  - **This key gives access to other customers' runs, so fix it before enabling on Cloud.** Daytona returns a sandbox's `env` from its API, and the org key can run commands in any sandbox. So code in one run can read another run's Laminar key and agent `env` (e.g. LLM keys).
  - User code does reach the orchestrator: through `agents[].import_path` (custom agents run in the Harbor process), `verifier.import_path`, and the suite directory prepended to `PYTHONPATH` (a suite file can shadow any module Harbor imports).
  - Planned fix: proxy Harbor's Daytona calls through the app-server with a per-run token, limited to sandboxes labelled with that run.
- **`harbor run` CLI flags can't override a `-c` config's datasets** (`-i` requires `-p`), and `-m` only applies together with `-a`. That's why the orchestrator edits the loaded YAML (`build_job_config`) instead of passing flags. The `tasks` filter has to cover both `datasets[].task_names` and the top-level `tasks` list, matched the way Harbor names tasks (`fnmatch` on the directory name, or `name` for registry tasks). `orchestrator.py` indexes every `LMNR_EVAL_RUN` key directly; the `hosted_evals::tests` contract test pins them.
- **Daytona quirks hit while building this:**
  - Harbor needs the `harbor[daytona]` extra; plain `harbor` fails every trial with `MissingExtraError`.
  - The toolbox session shell is **zsh**, so an unquoted `harbor[daytona]==…` is a glob that fails with `no matches found`. Keep it quoted.
  - Self-delete is a `curl -X DELETE` chained after `uv run` in the shell command, not Python, so a failed bootstrap doesn't leave a sandbox idling until `ttlMinutes`. Daytona sets `DAYTONA_SANDBOX_ID` inside every sandbox.
  - `cpu`/`memory` on create return 400 "Cannot specify Sandbox resources when using a snapshot". The orchestrator runs on the default 1 vCPU / 1 GB.
  - `autoStopInterval` must be 0: a running background command doesn't count as activity. `HOSTED_EVALS_MAX_RUN_MINUTES` (default 720) is the hard cap via `ttlMinutes`.
  - The toolbox base is `<toolboxProxyUrl>/<sandboxId>` (`toolboxProxyUrl` comes from the create response, so self-hosted Daytona works).
- **Testing without S3:** the endpoint needs real S3, but the run path can be exercised by calling `hosted_evals::start_run` directly with any public archive URL (e.g. one served from a second Daytona sandbox via `GET /api/sandbox/{id}/ports/{port}/signed-preview-url`). A one-task Harbor suite with `agents: [{name: oracle}]` finishes in about 40 s, including the ~10 s `uv` install. Starting app-server with dummy `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` plus `S3_EXPORTS_BUCKET` enables the feature.
  - For a real local S3, run `uvx --from 'moto[server]' moto_server -p 9100` (the MinIO binary download now returns 410). Start the app-server with `AWS_ENDPOINT_URL=http://127.0.0.1:9100`; the SDK honours it and uses path-style addressing for an IP endpoint.
  - moto's `list-objects-v2` omits `KeyCount`, so count `Contents` instead.
- The Daytona org used for testing is shared with other workloads: delete only sandboxes you created (filter by labels, e.g. `lmnr-project-id`).
