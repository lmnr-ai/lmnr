# Hosted evals (Harbor trials in Daytona, proxied through the app-server)

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

`app-server/src/hosted_evals/` lets `lmnr-cli eval run --remote` run a project's Harbor suites with every trial in a Daytona sandbox (LAM-2427, LAM-2434). The client side lives in lmnr-ts: `packages/lmnr-cli/src/commands/eval/` and the Harbor environment class `packages/lmnr-cli/assets/lmnr_hosted_env.py`. v0 has no run status API: results arrive as regular evaluations through the Laminar Harbor plugin.

## Shape

- **Harbor always runs where `lmnr-cli` runs**, in every mode. Remote trials use a custom Harbor environment (`environment.import_path = "lmnr_hosted_env:LaminarEnvironment"`) whose methods call the app-server's sandbox routes with a project API key. The app-server forwards to Daytona. **The Daytona key never leaves the app-server.**
- **Attached** (`--remote --attach`): Harbor runs on the user's machine.
- **Detached** (`--remote`, the default remote mode): the CLI uploads the evals folder and `POST /runs` starts one orchestrator sandbox (Daytona default snapshot) that downloads the archive from the app-server and runs `npx lmnr-cli@<requesting CLI version> eval orchestrate`, i.e. the same attached code path, with a short-lived project key. The run spec (`LMNR_EVAL_RUN`) is opaque to the server: the CLI writes it and the same CLI version reads it.

## Routes (`api/v1/hosted_evals.rs`)

All under `/v1/hosted-evals`, project API key. The CLI twins (`api/v1/cli/hosted_evals.rs`, `CliProjectAuth`) exist only for what the CLI itself calls: `contexts/*`, `images/layers/*`, `POST images`, `POST uploads`, `POST runs`.

| Route | What |
|---|---|
| `GET/PUT /contexts/{md5}` | Docker build context (uncompressed tar). `PUT` streams it into Daytona's build bucket; the md5 is verified while streaming and a mismatch aborts the multipart upload. |
| `POST /images/layers/missing` | `{diffIds}` → `{missing}`: layers (by uncompressed digest) the project still has to upload. |
| `PUT /images/layers/{diffId}` | Gzip layer body (8 GiB cap), streamed into Daytona's registry → `{digest, size}`. |
| `POST /images` | `{config}` (the image config JSON, verbatim) → `{image}` (manifest digest); `409 {missing}` if a layer isn't uploaded. Rejects non-`amd64` configs. |
| `POST /images/snapshots` | `{image, cpus?, memoryGb?, diskGb?}` → `{state: ready \| pending \| failed}`. Creates the image's snapshot for those resources on first call; Harbor's class polls it. Key only. |
| `POST /sandboxes` | `{dockerfile, contextHashes, …}` (Daytona builds) or `{image, …}` (needs a ready snapshot, else `409`) plus `cpus?, memoryGb?, diskGb?` → `201 {sandboxId}`. Returns before the sandbox starts; clients poll `GET`. |
| `GET/DELETE /sandboxes/{id}` | `{state, errorReason}` / delete. |
| `POST /sandboxes/{id}/commands` | `{command}` → `{commandId}` (async). |
| `GET /sandboxes/{id}/commands/{commandId}` | `{exitCode: null}` while running, then `{exitCode, stdout, stderr}`. |
| `PUT/GET /sandboxes/{id}/files?path=/abs` | Raw file body (512 MiB cap). Directories are tarred by the Python class. |
| `POST /uploads`, `GET /uploads/{id}` | Detached-run archive (`.tar.gz`, 100 MiB), in `S3_EXPORTS_BUCKET`. The orchestrator downloads with its run key; no presigned URL, so it also works for self-hosted S3 that Daytona can't reach. |
| `POST /runs` | `{uploadId, cliVersion, spec}` → `202 {sandboxId}`. |

## Invariants and gotchas

- **Project scoping is a sandbox label.** Every sandbox gets `lmnr-project-id` (+ `lmnr-role` = `trial` / `orchestrator`). `sandboxes::resolve` checks the label before any toolbox call and caches `hosted_evals_sandbox:{project}:{sandbox}` → toolbox URL only after a match. Another project's id answers 404, never 403.
- **Build contexts are shared org-wide in Daytona's bucket** (`<org>/<hash>/context.tar`). Clients name a context by `md5(tar)`; it is stored under `contexts::stored_hash = md5(project_id ++ hash)`, and `POST /sandboxes` maps hashes the same way. So one project can neither read nor plant another project's context. Keep the derivation in both places.
- **Two image paths.** The CLI always builds `lmnr.yaml` images with local Docker and pushes them (`hosted_evals/images.rs`, next bullets). There is no no-Docker fallback. Per-task Dockerfiles and public `docker_image`s not in `lmnr.yaml` still have Daytona build from `buildInfo`. Daytona caches a `buildInfo` build only by exact Dockerfile + contexts: changing one file reran a 30 s `RUN` before the `COPY` every time (4/4 runs), so pushing is what makes code changes cheap.
- **Pushed images go through Daytona's registry** (`GET /docker-registry/registry-push-access`: temporary basic-auth robot for `cr.app.daytona.io/sbox-transient`, Harbor). Those credentials cover the whole org, so they never leave the app-server and every byte goes through it. Each project pushes to `sbox-transient/lmnr-<sha256(DAYTONA_API_KEY ++ project_id)[..24]>`, so a digest from another project isn't in the caller's repository and its snapshot simply fails. Rotating `DAYTONA_API_KEY` renames every repository (one-time re-push). The robot can't delete or list the catalog; `sbox-transient` is staging for snapshot creation, which copies the image (`pulling` → `snapshotting` → `active`).
- **Layers are keyed by `diff_id`** (uncompressed digest, known from the config without compressing) → `hosted_evals_layer:{project}:{diff_id}` = `{digest, size}` of the gzip blob, 7-day TTL. `missing_layers` also `HEAD`s the blob, so a blob the registry dropped is re-uploaded. Losing the cache (in-memory in LITE, Redis eviction) means one full re-upload, and since the CLI re-gzips, new blob digests, a new manifest and a new snapshot. The `diff_id` isn't verified server-side: a wrong one only breaks the uploader's own image.
- **Daytona's registry tags are immutable:** a second `PUT` of the same tag answers `412`. Tags are `sha256-<manifest digest>`, so `put_manifest` skips one that exists (`HEAD`) and treats a `412` on the `PUT` as success. Measured: 12 concurrent `PUT`s of a new tag all got `201`, and a `PUT` after they committed got `412`. A concurrent push that lands between our `HEAD` and our `PUT` gets that 412.
- **Snapshots fix resources** (sandbox + `snapshot` + `cpu` → 400), so there is one per image and resource shape: `lmnr-<project key[..16]>-<image[..16]>-<c>c<m>g<d>d`. Unset disk defaults to the cap (the image must fit). Creating an existing name answers `409`; `get_snapshot` works by name. A snapshot whose image is missing becomes `error` but keeps its name, so `ensure_snapshot` deletes failed ones for the next run to retry. `inactive` ones get `POST /snapshots/{id}/activate`. On each new snapshot, the project's snapshots idle for 7 days (`lastUsedAt`, else `createdAt`) are deleted. Timings: ~15 s from push to active for a 45 MB image; sandbox from an active snapshot 0.6–3.5 s.
- **`buildInfo` path:** `POST /sandboxes` passes `buildInfo {dockerfileContent, contextHashes}` straight to Daytona `POST /sandbox`. Daytona builds and caches by build info (first build ~10 s for a small image, then 1-2 s). Resources ARE allowed with `buildInfo` (unlike with `snapshot`, which 400s "Cannot specify Sandbox resources when using a snapshot"). Public images go through the same path as `FROM <image>`. The context tar's entries are paths relative to the build-context root.
- **Daytona REST session logs merge stdout and stderr** (the SDK splits only the websocket stream). `start_command` wraps the command as `sh -c '<cmd>' 2>/tmp/.lmnr-exec/<session>` and `command_result` reads that file back. One session per command, as Harbor's Daytona environment does.
- **`DELETE` on a sandbox that is being destroyed (or still transitioning) answers `409 "Sandbox state change in progress"`.** `Daytona::delete_sandbox` treats gone/destroying as deleted and retries other 409s for up to a minute.
- **Limits:** `HOSTED_EVALS_MAX_SANDBOXES_PER_PROJECT` (default 50, `429` past it), per-sandbox `HOSTED_EVALS_MAX_SANDBOX_{CPUS,MEMORY_GB,DISK_GB}` clamps, and `ttlMinutes = HOSTED_EVALS_MAX_RUN_MINUTES` on every sandbox, so a crashed client can't leak one past the cap. `autoStopInterval` stays 0: a running command doesn't count as activity.
- **The sandbox cap needs two things, because Harbor creates trials concurrently.** Every create (trial and orchestrator) goes through `sandboxes::create_within_capacity`:
  - **A per-project lock** (`hosted_evals_capacity_lock:{project}`) is held across the count and the create. Without it, a burst of 8 creates with a cap of 3 got 8× `201`.
  - **A recent-creates record** (`hosted_evals_recent_sandboxes:{project}`). Daytona's `GET /sandbox` is eventually consistent: a new sandbox shows up about 1 s after the create returns, so the lock alone still let all 8 through. Creates from the last 15 s that the list doesn't show yet are added to the count.
  - Deleted sandboxes drop out of the list, so a recent create missing from it may already be gone; counting it errs on the safe side.
  - Daytona answers a create in about 100 ms, so a burst queues for seconds. Past 60 s of waiting the request gets a `429` (`CapacityBusy`), which `lmnr_hosted_env.py` retries.
  - If the cache errors, creates proceed unlocked (the cap is best-effort) rather than failing.
- **Detached runs mint their own key**: `lmnr-internal-evals-<UTC timestamp>` (`RUN_KEY_NAME_PREFIX`), full (the plugin needs `/v1/evals`), expiring with the TTL, deleted if the launch fails. The frontend's `getApiKeys` hides the prefix: keep the two constants in sync. The key is visible to user code in the orchestrator, which is fine: it only reaches the project that started the run.
- **The orchestrator command** (`ORCHESTRATOR_COMMAND`) runs in the Daytona session shell, which can be zsh: no bash-only syntax. The npm spec goes through env (`LMNR_CLI_PACKAGE`) rather than being spliced into the command; `cliVersion` must be plain semver characters. It self-deletes through `DELETE /v1/hosted-evals/sandboxes/$DAYTONA_SANDBOX_ID` (Daytona sets that env var) with the run key, however the run ended. The default snapshot (`daytonaio/sandbox:0.8.0`) ships node 25, npx and uv; 1 vCPU / 1 GB.
- **Harbor semantics to remember when debugging trials:** a task with its own `environment/Dockerfile` (and no `docker_image`) does NOT get `environment/` uploaded after start; its Dockerfile must `COPY` the case data. The Laminar plugin exports spans over gRPC (port 8443 unless `--pk grpc_port=`; the CLI forwards `LMNR_GRPC_PORT`), datapoints over HTTP.

## Testing locally

- Uploads need S3: `uvx --from 'moto[server]' moto_server -p 9100`, create the bucket, and start the app-server with `AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://127.0.0.1:9100 S3_EXPORTS_BUCKET=<bucket>`. The contexts client builds its own S3 config from Daytona's push-access creds, so `AWS_ENDPOINT_URL` doesn't leak into it. moto's `list-objects-v2` omits `KeyCount`.
- Attached runs work against `localhost:8000` (`LMNR_BASE_URL=http://localhost:8000`, `LMNR_GRPC_PORT=8001` in the scratch project's `.env`). Without a CLI login the CLI falls back to `LMNR_PROJECT_API_KEY`, which exercises the key routes.
- Detached runs need the app-server reachable from Daytona: a cloudflared quick tunnel (`cloudflared tunnel --url http://localhost:8000`, binary from GitHub releases) as `HOSTED_EVALS_LMNR_BASE_URL`, and an unreleased CLI via `HOSTED_EVALS_CLI_PACKAGE=<url of a pnpm-packed tgz>` (serve it through a second tunnel). This host caches the DNS miss for a brand-new trycloudflare hostname for a while; Daytona resolves it fine. Traces from detached runs don't reach a tunnelled local server (gRPC), datapoints do.
- Cross-project checks need a key for a second project: insert an expiring `lmnr-internal-evals-*` row for another project and delete it afterwards.
- The Daytona org is shared with other workloads: delete only sandboxes you created (filter by `lmnr-project-id`) and snapshots named `lmnr-<16 hex>-<16 hex>-…` you created.
- **Real Docker for the push path:** this sandbox has none, but Docker-in-Docker works in a Daytona sandbox (`FROM docker:27-dind` + `apk add nodejs npm` + uv; start `dockerd` in a command). Create one through the local app-server's `POST /sandboxes`, upload the `pnpm pack`ed CLI and a scratch project through the files route, point the project's `LMNR_BASE_URL` at the tunnel, and run `lmnr-cli eval run` there, local mode included. `crane pull --format=tarball` writes a `docker save`-style archive for server-only checks without Docker.
- Never `pkill -f <pattern>` with a pattern that also appears in your own command line: it kills the shell running it. Stop test processes by PID.
