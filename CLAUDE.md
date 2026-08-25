# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Laminar is an open-source observability platform for AI agents: OpenTelemetry-native tracing, evaluations, AI monitoring, and SQL access to all data.

## Repository Structure

Multi-service monorepo:

- **app-server/** — Rust backend (Actix-web HTTP, Tonic gRPC). SQL query validation + JSON↔SQL conversion run in-process (`src/query_engine/`, built on `sqlparser`).
- **frontend/** — Next.js/TypeScript web UI.
- **pii-redactor/** — optional standalone Rust gRPC service running a HuggingFace PII model on CPU via ONNX Runtime. See `pii-redactor/README.md`.

Some features (Signals evaluation, Laminar Agent, clustering) are enterprise-only and live in the private `lmnr-private` repo behind the `signals` cargo feature; OSS ships stubs and public scaffolding for them. Don't document them as OSS features.

## Development Commands

### Frontend (Next.js)

```bash
cd frontend
pnpm install        # Install dependencies
pnpm run dev        # Start dev server with Turbopack
pnpm lint           # Check linting (lint:fix to auto-fix)
pnpm format:write   # Format with Prettier
pnpm type-check     # TypeScript type checking
pnpm test           # Run tests (tsx --test tests/**/*.test.ts)
pnpm build          # Production build
```

- In a fresh checkout, `pnpm type-check` (and the husky pre-commit hook) fails with `TS2307: Cannot find module '@/assets/...svg'` errors — `next-env.d.ts` is gitignored. Fix: `npx next typegen` (or any `next dev`/`next build` run).
- `tsconfig.json` sets `"incremental": true`, so a bare `npx tsc --noEmit` can report **zero errors on files it skipped** and give a false green. When verifying a type fix, run `npx tsc --noEmit --incremental false` (the pre-commit hook does a full check and will catch what you missed otherwise).

### Backend (Rust)

```bash
cd app-server
cargo r                    # Run in development mode
cargo build --release      # Production build
cargo test -- --nocapture  # Run tests
```

- `cargo check --features signals` and `cargo fmt` on `main.rs` both fail in OSS — the `signals` feature gates modules that live only in `lmnr-private`. Default-feature `cargo check` is the real gate; format leaf files individually with `rustfmt --edition 2024 <file>`. Full stub workaround list: `docs/internal/app-server.md`.

## Local Development Setup

```bash
cp app-server/.env.example .env   # app-server reads .env at the repo root (dotenv)
cp frontend/.env.local.example frontend/.env.local
```

**PostgreSQL** and **ClickHouse** are required. Everything else degrades gracefully: RabbitMQ → in-memory queue, Redis → in-memory cache, Quickwit → search disabled, S3 → MockStorage.

Docker-based:

```bash
# Frontend-only (pre-built app-server image):
docker compose -f docker-compose-local-dev.yml up
cd frontend && pnpm run dev

# Full-stack (all dependencies, run app-server + frontend yourself):
docker compose -f docker-compose-local-dev-full.yml up
cd app-server && cargo r      # Terminal 1
cd frontend && pnpm run dev   # Terminal 2
```

**Gotcha:** `dotenv` does NOT override already-exported env vars. A shell that exports `PORT` silently breaks the app-server HTTP listener (bind error is swallowed) and `next dev` (`EADDRINUSE`). Launch with explicit `PORT=8000 cargo r` / `PORT=3000 pnpm run dev`, or `env -u PORT`. Details: `docs/internal/app-server.md`.

## Architecture

```
Frontend (5667 prod / 3000 local-dev) ────┐
                                          │
App Server                                │
├─ REST API (8000) ◄──────────────────────┘
├─ gRPC ingestion (8001) ◄─── SDK traces
└─ Realtime SSE (8002)
   │
   ├──► PostgreSQL (5433)  - main database        [required]
   ├──► ClickHouse (8123)  - analytics/spans      [required]
   ├──► RabbitMQ (5672)    - async processing     [optional]
   └──► Quickwit (7280/81) - full-text search     [optional]
```

## Database Migrations

Schema is managed with Drizzle ORM; the database itself is the source of truth — do NOT edit schema files directly.

```bash
cd frontend
pnpm db:generate   # generate migrations AND strip "public". qualifiers (required)
# Migrations are applied automatically on frontend startup
```

- Migration SQL must stay schema-neutral (no `"public".` qualifiers) — `pnpm db:generate` handles the strip; if you generate by hand, run `pnpm db:strip-schema` after.
- Hand-written migrations also need a `meta/NNNN_snapshot.json` or the next generate produces a duplicate migration.
- ClickHouse migrations (`frontend/lib/clickhouse/migrations/`) run once and are checksummed — NEVER modify an applied migration file; always add a new numbered one.
- Full details (drizzle-kit quirks, snapshots, `POSTGRES_SCHEMA`): `docs/internal/database.md`.

## Comment style

Keep comments short: a single terse line covering the WHY (non-obvious constraint, invariant, workaround). No multi-paragraph rationale blocks. Prefer removing a comment once identifier names make intent obvious.

## App-server conventions

- Every env var is registered in `app-server/src/env/` (typed `NumEnv`/`StringEnv`/`BoolEnv` descriptors) — never inline a string-literal env name at a call site.
- `mod env` shadows `std::env`: inside files with `use crate::env;`, write `std::env::var(...)` fully qualified.
- Backend `Feature` flags are fine-grained — one flag per feature; never gate a new feature on another feature's flag.
- More: `docs/internal/app-server.md`.

## Frontend conventions

- One component per file; keep components <150 lines; related components in a folder with `index.tsx`.
- Complex state belongs in a Zustand store (with `shallow` selectors); use nuqs for URL param state — never sync URL params into a store via `useEffect`.
- Client fetches: `try/catch`, check `res.ok`, toast on error. API routes: `try/catch`, 400 for `ZodError`, 500 otherwise, always JSON with an `error` field. Use `AbortController` for superseded in-flight fetches.
- Recharts is pinned at v2 (`^2.15.4`); a v3 upgrade was reverted — use only v2 APIs.
- New data tables MUST follow the `InfiniteDataTable` split pattern (index/contents/controls/constants). Full patterns: `docs/internal/frontend-best-practices.md`.

## Key Technical Details

- **Rust edition**: 2024
- **Node version**: 26 (`frontend/Dockerfile` is `node:26-alpine`)
- **Package managers**: Cargo (Rust), pnpm (frontend)
- **Git workflow**: Submit PRs to `dev` branch, which merges to `main` periodically

## Pre-commit Hooks

Frontend uses Husky with lint-staged: Prettier, ESLint, and `tsc --noEmit` run on staged files. If type-check fails on pre-existing SVG/PNG asset-import errors, verify your own files are clean (`npx tsc --noEmit 2>&1 | grep "your-file"`) before using `--no-verify`.

## Detailed topic notes (read on demand)

`docs/internal/` holds detailed, hard-won working notes. **Before working in one of these areas, read the matching file** — it documents invariants, security boundaries, and gotchas that are not inferable from the code:

| File | Read when touching |
|---|---|
| `docs/internal/database.md` | Postgres migrations, `POSTGRES_SCHEMA`, name-sort collation |
| `docs/internal/sql-query-engine.md` | `query_engine/` validator (a security boundary), SQL editor schema/autocomplete, `/v1/sql/query` guards, rate limiting |
| `docs/internal/clickhouse-traces.md` | `traces_agg`/`traces_static`/`traces_v0`, spans query scoping, trace aggregation, async-insert tuning, traces-table filters, project data deletion |
| `docs/internal/dedup-search.md` | `shared_content`/`llm_messages` dedup, `spans_v0` reconstruction, Quickwit indexing/search |
| `docs/internal/ingestion.md` | OTLP `/v1/traces`, GenAI semconv parsing, trace metadata patches, input/output extraction, system-prompt extraction, checkpoints, 413s |
| `docs/internal/observability.md` | App-server self-tracing, Sentry layers/sampling |
| `docs/internal/mq-redis.md` | RabbitMQ queues + streams transport, Redis resilient connections, readiness probes |
| `docs/internal/auth.md` | Better Auth, OAuth providers, CLI device-flow auth, project API keys |
| `docs/internal/billing.md` | Tiers, usage warnings/hard limits, signal cost metering, custom model costs |
| `docs/internal/signals.md` | Signals, alerts, signal events, CLI CRUD (`trigger`/`filters`/`mode`) |
| `docs/internal/slack.md` | Slack OAuth broker + brokered self-hosted integration |
| `docs/internal/ai-features.md` | `getLanguageModel`, LLM provider config, Vercel AI SDK v7 |
| `docs/internal/analytics.md` | PostHog, Loops sync, self-hosted telemetry heartbeat |
| `docs/internal/labeling-queues.md` | Labeling queues (ClickHouse RMT items, dirty-state, push-to-dataset) |
| `docs/internal/debugger.md` | Debugger replay cache, debugger session blocks/timeline |
| `docs/internal/frontend-tables.md` | Data-table filters, advanced search, evaluations page, dashboards |
| `docs/internal/frontend-trace-view.md` | Trace view, span rendering/message parsing, ContentRenderer, rrweb replay |
| `docs/internal/frontend-app.md` | Settings pages, onboarding, base-path serving, render templates, SSE proxy routes, landing page, agent stubs |
| `docs/internal/frontend-best-practices.md` | Any new frontend component/table/store work |
| `docs/internal/app-server.md` | App-server env vars, local dev env quirks, signals-feature build stubs |
