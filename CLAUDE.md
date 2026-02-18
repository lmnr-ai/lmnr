# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Laminar is an open-source observability platform for AI agents. It provides OpenTelemetry-native tracing, evaluations, AI monitoring, and SQL access to all data.

## Repository Structure

This is a multi-service monorepo with three main components:

- **app-server/** - Rust backend (Actix-web HTTP, Tonic gRPC)
- **frontend/** - Next.js/TypeScript web UI
- **query-engine/** - Python gRPC service for SQL query processing

## Development Commands

### Frontend (Next.js)

```bash
cd frontend
pnpm install                    # Install dependencies
pnpm run dev                    # Start dev server with Turbopack
pnpm lint                       # Check linting
pnpm lint:fix                   # Auto-fix linting issues
pnpm format:write               # Format code with Prettier
pnpm type-check                 # TypeScript type checking
pnpm test                       # Run tests (tsx --test tests/**/*.test.ts)
pnpm build                      # Production build
```

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

### Frontend-only development:
```bash
docker compose -f docker-compose-local-dev.yml up  # Starts postgres, clickhouse, app-server
cd frontend && pnpm run dev
```

### Full-stack development:
```bash
docker compose -f docker-compose-local-dev-full.yml up  # Starts postgres, clickhouse, rabbitmq
cd app-server && cargo r                                 # In terminal 1
cd frontend && pnpm run dev                              # In terminal 2
cd query-engine && uv run python server.py               # In terminal 3
```

### Environment setup:
```bash
cp .env.example .env
cp frontend/.env.local.example frontend/.env.local
```

## Architecture

```
Frontend (5667) ─────────────────────────┐
                                         │
App Server                               │
├─ REST API (8000)  ◄────────────────────┘
├─ gRPC ingestion (8001) ◄─── SDK traces
└─ Realtime SSE (8002)
         │
         ├──► PostgreSQL (5433) - main database
         ├──► ClickHouse (8123) - analytics/spans
         ├──► RabbitMQ (5672) - async processing
         ├──► Query Engine (8903) - SQL processing
         └──► Quickwit (7280/7281) - full-text search
```

## Database Migrations

Database schema is managed with Drizzle ORM. The source of truth is the database itself - do NOT edit schema files directly.

```bash
cd frontend
npx drizzle-kit generate        # Generate migrations after manual DB changes
# Migrations are applied automatically on frontend startup
```

## Key Technical Details

- **Rust edition**: 2024 (requires Rust 1.90+)
- **Node version**: 24+ (see Docker files)
- **Python version**: 3.13+
- **Package managers**: Cargo (Rust), pnpm (frontend), uv (Python)
- **Git workflow**: Submit PRs to `dev` branch, which merges to `main` periodically

## Pre-commit Hooks

The frontend uses Husky with lint-staged. Before commits:
- Prettier formats staged files
- ESLint fixes issues
- TypeScript type-check runs

## Testing Before PR

```bash
docker compose -f docker-compose-local-build.yml up  # Builds from source and runs in production mode
```
