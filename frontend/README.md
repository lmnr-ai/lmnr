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

Self-hosted deployments collect anonymized usage telemetry. To opt out, set `LAMINAR_TELEMETRY_DISABLED=true` in your `.env`.

For Docker Compose, set the variable in the repository-root `.env`; the Compose stacks pass it to the frontend container. For manual frontend development, set it in `frontend/.env.local`. Helm deployments can set it with `frontend.extraEnv`.
