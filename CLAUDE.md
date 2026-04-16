# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Laminar is an open-source observability platform for AI agents. It provides OpenTelemetry-native tracing, evaluations, AI monitoring, and SQL access to all data.

## Repository Structure

This is a multi-service monorepo with two main components:

- **app-server/** - Rust backend (Actix-web HTTP, Tonic gRPC)
- **query-engine/** - Python gRPC service for SQL query processing

## Development Commands

### Backend (Rust)

```bash
cd app-server
cargo r                         # Run in development mode
cargo build --release           # Production build
cargo test -- --nocapture       # Run tests
```

### Query Engine (Python)

```bash
cd query-engine
uv sync                         # Install dependencies
uv run python server.py         # Run gRPC server
uv run pytest                   # Run tests
```

## Local Development Setup

### Environment setup:
```bash
cp .env.example .env
```

### Minimal Working Setup

**PostgreSQL**, **ClickHouse**, and **Query Engine** are required. Other services have automatic fallbacks:

| Service      | Required | Fallback when not configured |
|--------------|----------|------------------------------|
| PostgreSQL   | Yes      | None                         |
| ClickHouse   | Yes      | None                         |
| Query Engine | Yes      | None                         |
| RabbitMQ     | No       | In-memory queue (TokioMpsc)  |
| Redis        | No       | In-memory cache (Moka)       |
| Quickwit     | No       | Search disabled gracefully   |
| S3 Storage   | No       | MockStorage                  |

### Docker-based development

**Full-stack with all services:**
```bash
docker compose -f docker-compose-local-dev-full.yml up  # All dependencies
cd app-server && cargo r                                 # Terminal 1
cd query-engine && uv run python server.py               # Terminal 2
```

## Architecture

```
App Server
├─ REST API (8000)
├─ gRPC ingestion (8001) ◄─── SDK traces
└─ Realtime SSE (8002)
         │
         ├──► PostgreSQL (5433) - main database [required]
         ├──► ClickHouse (8123) - analytics/spans [required]
         ├──► RabbitMQ (5672) - async processing [optional, has in-memory fallback]
         ├──► Query Engine (8903) - SQL processing [required]
         └──► Quickwit (7280/7281) - full-text search [optional]
```

## Signals and Alerts

- Alerts reference signals via `alerts.source_id`. There is NO FK constraint from `source_id` to `signals.id` because `source_id` may reference other entity types in the future.
- The Signals feature requires `GOOGLE_GENERATIVE_AI_API_KEY` or AWS Bedrock credentials to be set.
- Alert metadata is stored as JSONB in `alerts.metadata`. For `SIGNAL_EVENT` alerts, it contains `{severity: 0|1|2}` (info/warning/critical). The Rust backend reads this in `postprocess.rs` to filter events by severity threshold, defaulting to CRITICAL (2) when metadata is absent.
- Creating a signal auto-creates a CRITICAL-severity alert and subscribes all workspace member emails as alert targets.

## Signal Triggers

- Signal trigger filters are evaluated in `app-server/src/db/trace.rs` (`matches_filters` / `evaluate_single_filter`). Spans arrive in batches, so filter evaluation must check accumulated state from the DB (e.g. `trace.span_names`) — not just the current batch's raw spans. The `traces.span_names` JSONB column aggregates span names across all batches via `||` merge on upsert.
- Trigger evaluation flow: `process_span_messages` → `upsert_trace_statistics_batch` (returns merged DB trace) → `check_and_push_signals` → `matches_filters`. All filters use AND logic.
- Run targeted tests with `cargo test --bin app-server db::trace::tests -- --nocapture`.

## Key Technical Details

- **Rust edition**: 2024 (requires Rust 1.90+)
- **Python version**: 3.13+
- **Package managers**: Cargo (Rust), uv (Python)
- **Git workflow**: Submit PRs to `dev` branch, which merges to `main` periodically
