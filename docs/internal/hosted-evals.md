# Hosted evals (Harbor runs in Daytona)

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

`app-server/src/hosted_evals/` runs a project's Harbor `evals/` folder in the cloud (LAM-2427). v0 is start-only: no run status, no evaluation id in the response.

## Flow

1. `POST /v1/hosted-evals/uploads` (project API key) returns `{uploadId, url}`. The client `PUT`s a `.tar.gz` of the `evals/` folder's *contents* to `url`, a presigned S3 PUT (15 min) for `hosted-evals/<project_id>/<upload_id>.tar.gz` in `S3_EXPORTS_BUCKET`.
2. `POST /v1/hosted-evals/runs` with `{uploadId, datasets?, tasks?, nAttempts?, nConcurrent?, model?, env?}`. It HEADs the archive (400 if absent), presigns a GET, creates a Daytona sandbox on the default snapshot, waits for `started`, then runs the orchestrator command in a toolbox session with `runAsync`. Returns `202 {sandboxId}`.
3. The orchestrator (`orchestrator.py`, embedded with `include_str!` and passed as env `LMNR_EVAL_SCRIPT`, params as JSON in `LMNR_EVAL_RUN`) downloads and extracts the archive. For each suite (an archive-root dir with `harbor.yaml`, a Harbor JobConfig) it writes an overridden config and runs `harbor run -c … --plugin laminar --pk group_name=<suite>` with trials on Daytona. The sandbox then deletes itself.

## Invariants and gotchas

- **Routes live under `/hosted-evals`, not `/evals/…`**: `POST /v1/evals/{eval_id}` (update eval) would capture `POST /v1/evals/runs`.
- **The run reports with the caller's own key.** The auth middleware only keeps the hash in `ProjectApiKey`; the handler re-reads the raw token via `BearerAuth` and passes it as `LMNR_PROJECT_API_KEY`. Ingest-only keys can't reach the route (the `/v1` scope blocks them), and the plugin needs a full key for `/v1/evals` anyway.
- **The same `DAYTONA_API_KEY` goes into the sandbox** (Harbor's `-e daytona` needs it), and user eval code can read it. Use a dedicated Daytona org with a spend limit. Never add other secrets to the sandbox env.
- **`harbor run` CLI flags can't override a `-c` config's datasets** (`-i` requires `-p`), and `-m` only applies together with `-a`. That's why the orchestrator edits the loaded YAML (`build_job_config`) instead of passing flags. `orchestrator.py` indexes every `LMNR_EVAL_RUN` key directly; the `hosted_evals::tests` contract test pins them.
- **Daytona quirks hit while building this:**
  - Harbor needs the `harbor[daytona]` extra; plain `harbor` fails every trial with `MissingExtraError`.
  - The toolbox session shell is **zsh**, so an unquoted `harbor[daytona]==…` is a glob that fails with `no matches found`. Keep it quoted.
  - Self-delete is a `curl -X DELETE` chained after `uv run` in the shell command, not Python, so a failed bootstrap doesn't leave a sandbox idling until `ttlMinutes`. Daytona sets `DAYTONA_SANDBOX_ID` inside every sandbox.
  - `cpu`/`memory` on create return 400 "Cannot specify Sandbox resources when using a snapshot". The orchestrator runs on the default 1 vCPU / 1 GB.
  - `autoStopInterval` must be 0: a running background command doesn't count as activity. `HOSTED_EVALS_MAX_RUN_MINUTES` (default 720) is the hard cap via `ttlMinutes`.
  - The toolbox base is `<toolboxProxyUrl>/<sandboxId>` (`toolboxProxyUrl` comes from the create response, so self-hosted Daytona works).
- **Testing without S3:** the endpoint needs real S3, but the run path can be exercised by calling `hosted_evals::start_run` directly with any public archive URL (e.g. one served from a second Daytona sandbox via `GET /api/sandbox/{id}/ports/{port}/signed-preview-url`). A one-task Harbor suite with `agents: [{name: oracle}]` finishes in about 40 s, including the ~10 s `uv` install. Starting app-server with dummy `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` plus `S3_EXPORTS_BUCKET` enables the feature, and presigning works offline.
- The Daytona org used for testing is shared with other workloads: delete only sandboxes you created (filter by labels, e.g. `lmnr-project-id`).
