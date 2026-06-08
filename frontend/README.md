# Frontend

## Setup instructions

1. Install the latest versions of Node.js and React
2. Install pnpm

`npm install -g pnpm  # install pnpm globally`

3. Run the following commands:

`npm install`

## Run instructions

To start in dev mode

`pnpm run dev`

## Unit tests

Run

`pnpm test`

## Anonymous usage telemetry

`lib/telemetry/` emits an anonymous `self_hosted_heartbeat` to PostHog for
self-hosted deployments, wired fire-and-forget from `instrumentation.ts`. It's
gated by `Feature.TELEMETRY` (on by default, off on Laminar Cloud or when
`LAMINAR_TELEMETRY_DISABLED=true`). The payload is anonymous — an opaque
per-deployment UUID, app version, boolean feature flags, and aggregate row
counts; no PII, no IP. See the "Self-hosted Telemetry" section in the root
`CLAUDE.md` for the design (separate `telemetry` Postgres schema, CAS window
claim for cross-replica dedup, parameterized-view counting).
