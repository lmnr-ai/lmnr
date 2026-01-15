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

## Blog-only preview (no DB)

If you only need to view `/blog` locally, set `SKIP_LOCAL_DB=true` in `.env.local` to skip the startup migrations/initialization.

## Unit tests

Run

`pnpm test`

## Support page (optional)

`/support` calls `POST /api/support`, which proxies to a running support agent server.

Set:
- `SUPPORT_AGENT_URL` (default: `http://localhost:8787`)
- `SUPPORT_AGENT_SHARED_SECRET` (must match the agent server if enabled)
