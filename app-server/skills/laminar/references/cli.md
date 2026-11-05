# Laminar CLI

**`lmnr-cli`** is a standalone npm package for authenticating, querying data (SQL), managing datasets, and annotating/inspecting agent debug sessions. It ships independently of the `@lmnr-ai/lmnr` SDK — no SDK install needed — and is built to be driven by AI coding agents and humans.

## Contents

- Auth (OAuth Device Flow) and self-hosted config
- `lmnr-cli`: setup, login/logout, project, sql, dataset, eval run (pointer to [env-evals.md](env-evals.md))
- Debugging & session annotation (see [debugging.md](debugging.md))
- Agent-friendly output (`--json`)

### setup — one-shot onboarding

The fastest path from a fresh install to a working API key. Logs in (if needed), creates/reuses a workspace + project (idempotent per repo), mints a fresh project API key and writes `LMNR_PROJECT_API_KEY` to `./.env`, links the directory via `.lmnr/project.json`, and installs the Laminar agent skill into `.claude/`, `.cursor/`, `.codex/`, and/or `.agents/`.

```bash
lmnr-cli setup                  # human-readable summary
lmnr-cli setup --json           # machine-readable single-line JSON (for agents)
lmnr-cli setup --project-id <id>  # disambiguate when you can access >1 project
lmnr-cli setup --no-write-env   # skip writing ./.env
```

`setup` is designed to be invoked by coding agents and emits distinct exit codes per failure mode (e.g. `6` login failed, `7` no project, `8` `.env` write failed, `9` key mint failed, `12` existing key belongs to a different project). See `lmnr-cli setup --help` for all flags and codes. Re-running in the same repo reuses the project but mints a fresh key (old keys stay visible in the dashboard until revoked).

## Auth (OAuth Device Flow) and self-hosted config

`lmnr-cli` authenticates as a **user** via the OAuth Device Flow, not with a project API key. Every command runs on that user session.

```bash
lmnr-cli login          # opens a browser to approve the device code
```

Tokens are stored at `~/.config/lmnr/credentials.json` (mode `0600`, XDG-aware via `$XDG_CONFIG_HOME`; `%APPDATA%\lmnr` on Windows). It's a single signed-in user at a time — there is no project-API-key auth mode for the CLI and no multi-profile switching. Access tokens auto-refresh when within ~30s of expiry; if the session is revoked, the CLI errors and you re-run `lmnr-cli login`.

**Project resolution** for the data commands (`sql`, `dataset`, `debug`): `--project-id <id>` flag, else the `.lmnr/project.json` link written by `lmnr-cli setup`. With neither, the command errors and tells you to run `setup` or pass `--project-id`.

**The project API key is for your application's SDK, not the CLI.** `lmnr-cli setup` mints one and writes `LMNR_PROJECT_API_KEY=...` to `./.env` so your app can ingest traces. The CLI itself never reads it.

### Self-hosted config

Point the CLI at your deployment. `--frontend-url` is the dashboard/issuer (used for login); `--base-url` is the data API and carries **no port** — pass the port separately with `--port`.

```bash
lmnr-cli login --frontend-url http://localhost:3000 --base-url http://localhost --port 8000
lmnr-cli sql schema --base-url http://localhost --port 8000
```

Env equivalents: `LMNR_FRONTEND_URL` (default `https://www.laminar.sh`), `LMNR_BASE_URL` (default `https://api.lmnr.ai`), `LMNR_HTTP_PORT` (default `443`; use your self-hosted HTTP port). The CLI also auto-loads these `LMNR_*` keys from a `.env` / `.env.local` in the working directory.

`--base-url` / `--port` / `--project-id` / `--json` belong to each command group (`sql`, `dataset`, `debug`, `project`), **not** the top-level `lmnr-cli` — placing them before the subcommand fails with `unknown option`. Appending them to the end of the full command always works.

## `lmnr-cli`

Install:

```bash
npx lmnr-cli@latest <command>   # run without installing
npm install -g lmnr-cli         # or install globally
```


### login / logout — authentication

```bash
lmnr-cli login                                  # device-flow login
lmnr-cli login --frontend-url <url> --no-browser  # self-hosted / headless
lmnr-cli logout                                 # remove stored credentials
```

### project — discovery

```bash
lmnr-cli project list          # projects you can access (● = linked to this dir)
lmnr-cli project list --json
```

### sql — query data

Run SELECT-only ClickHouse SQL against the project's spans, traces, signal events, clusters, datasets, and evals. Queries are auto-scoped to the resolved project.

```bash
lmnr-cli sql query "SELECT name, duration FROM spans WHERE start_time > now() - INTERVAL 1 HOUR LIMIT 20"
lmnr-cli sql schema   # list tables and columns
```

Add `--json` for machine-readable stdout (logs go to stderr), ideal for piping:

```bash
lmnr-cli sql query "SELECT trace_id, total_cost FROM spans WHERE span_type = 'LLM' LIMIT 10" --json \
  | jq '.[] | select(.total_cost > 0.01)'
```

For writing scripts, or if you don't have access to the CLI, see [sql-query-api.md](sql-query-api.md).

### dataset — manage datasets

List, push, pull, and create datasets from `.jsonl` / `.json` / `.csv` files.

```bash
lmnr-cli dataset list --json
lmnr-cli dataset push data.jsonl -n my-dataset                     # add datapoints to existing dataset
lmnr-cli dataset pull output.jsonl -n my-dataset                   # download a dataset
lmnr-cli dataset create my-dataset data.jsonl -o my-dataset.jsonl  # create + write local copy with IDs
```

`push`/`pull` take `-n <name>` or `--id <id>`; `create`/`push`/`pull` accept `--batch-size` (default 100) and `-r`/`--recursive`. Datapoint `id` fields drive versioning — never edit them in local files. Deleting a datapoint locally does not delete it in Laminar; `push` only adds new datapoint versions.

### eval run — Harbor environment evals

`lmnr-cli eval run` runs the Harbor suites in `./evals` on local Docker (or in Laminar sandboxes with `--remote`) and reports every trial to Laminar as an evaluation datapoint. Setup, modes, flags, exit codes and `--json` output are in **[env-evals.md](env-evals.md)**.

## Debugging & session annotation

For debugging-related functionality in the CLI — `debug session new` / `set-name` / `add-note` / `summary` / `open` — see **[debugging.md](debugging.md)** for the full loop and how to use them.
