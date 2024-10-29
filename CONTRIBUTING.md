# Contribute to Laminar

Thank you very much for showing interest in contributing to Laminar!

## How to contribute

If you want to contribute to Laminar, first check open and closed issues
for any similar items. If you can find an existing issue, only add to it if you believe
you have additional context that will help us locate and debug the issue. 

If you want to contribute your code, ask in an open issue if it can be assigned to you.
Then fork the repo, and develop locally. Once you are done with your change, submit a pull
request through your fork. Our active development branch is `dev`, and we merge it into
`main` periodically. Please submit your PRs to `dev`, and consider including `dev`
when you fork the repo.

### Contributor License Agreement

When you open a pull request, CLA bot will ask you to sign our Contributor License Agreement (CLA).
We do this to avoid legal issues and disputes, and to stay compliant with relevant IP laws.

## Why are there so many docker-compose files?

Don't get overwhelmed by the number of docker-compose files. Here's a quick overview:

- `docker-compose.yml` is the simplest one that spins up frontend, app-server, and postgres. Good for quickstarts.
- `docker-compose-full.yml` is the one you want to use for running the full stack locally. This is the best 
for self-hosting.
- `docker-compose-local-dev.yml` is the one you want to use for local development. It will only
  run the dependency services (postgres, qdrant, clickhouse, rabbitmq). You will need to run
  `cargo r`, `pnpm run dev`, and `python server.py` manually.
- `docker-compose-local-build.yml` will build the services from the source and run them in production mode. This is good for self-hosting with your own changes,
or for testing the changes after developing on your own and before opening a PR.

| Service | docker-compose.yml | docker-compose-full.yml | docker-compose-local-dev.yml | docker-compose-local-build.yml |
|---------|-------------------|------------------------|----------------------------|------------------------------|
| postgres | ✅ | ✅ | ✅ | ✅ |
| qdrant | ❌ | ✅ | ✅ | ✅ |
| clickhouse | ❌ | ✅ | ✅ | ✅ |
| rabbitmq | ❌ | ✅ | ✅ | ✅ |
| app-server | ℹ️ | ✅ | 💻 | 🔧 |
| frontend | ℹ️ | ✅ | 💻 | 🔧 |
| semantic-search-service | ❌ | ✅ |  💻 | 🔧 |
| python-executor | ❌ | ✅ | 💻 | 🔧 |

- ✅ – service present, image is pulled from a container registry.
- 🔧 – service present, image is built from the source. This may take a while.
- ℹ️ - service present, but is a lightweight version.
- 💻 – service needs to be run manually (see below).
- ❌ – service not present.


## Running Laminar locally

If you want to test your local changes, you can run code separately in
development mode.

### 0. Configure environment variables

For each of app-server, semantic-search-service, and frontend, the environment is defined
in `.env.example` files, and you need to copy that to `.env` files, i.e.
```sh
cp .env.example .env
# and for frontend:
cp frontend/.env.local.example frontend/.env.local
```

### 1. Spin up dependency containers

```sh
docker compose -f docker-compose-local-dev.yml up
```

This will spin up postgres, qdrant, clickhouse, and RabbitMQ.

### 2. Run semantic search service in develop mode

```sh
# semantic-search-service
cd semantic-search-service
cargo r
```

Rust is compiled and not hot reloadable, so you will need to rerun `cargo r` every time you want
to test a change.

### 3. Run python code executor in development mode

```sh
cd python_executor/python_executor
poetry shell # or another virtual env, such as python venv or uv venv activation
python server.py
```

### 4. Run app server in development mode

Note, it is important to start semantic search service and python executor _before_ running
app server, because it tries to connect to them before starting the server

```sh
# app-server
cd app-server
cargo r
```

Rust is compiled and not hot-reloadable, so you will need to rerun `cargo r` every time you want
to test a change.

### 5. Run frontend in development mode

```sh
# frontend
cd frontend
pnpm run dev
```

### 6. After finishing your changes

Make sure everything runs well in integration in dockers.

```sh
# stop all the development servers:
# docker compose down

docker compose -f docker-compose-local-build.yml up
```

Note that this is a different Docker compose file. This one will not only spin up
dependency containers, but also build semantic search service, python executor,
app server and frontend from local code and run them in production mode.

## Database migrations

We use [drizzle ORM](https://orm.drizzle.team/) to manage database migrations. However,
our source of truth is always the database itself. In other words, the schema in the code 
is generated from the database state. Do NOT change the schema files directly.
If you need to make changes to the database schema, you will need to manually apply
those changes to the database, and then update the migration files by running
`npx drizzle-kit generate`.

Migrations are applied on frontend startup. This is done quite hackily in the `instrumentation.ts` file,
but this is a [recommended](https://github.com/vercel/next.js/discussions/15341#discussioncomment-7091594)
place to run one-time startup scripts in Next.js. This means that if you 
need to re-apply migrations, a simple `pnpm run dev` should do it.
