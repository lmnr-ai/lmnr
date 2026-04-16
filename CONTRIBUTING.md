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

- `docker-compose.yml` is the simplest one that spins up app-server, clickhouse, and postgres. Good for quickstarts.
- `docker-compose-full.yml` is the one you want to use for running the full stack locally. This is the best 
for self-hosting.
- `docker-compose-local-dev-full.yml` full file for local development. To be used when you make changes
  to the backend. It will only run the dependency services (postgres, clickhouse, rabbitmq).
  You will need to run `cargo r` and `python server.py` manually.
- `docker-compose-local-dev.yml` is a lightweight version without RabbitMQ.
- `docker-compose-local-build.yml` will build the services from the source and run them in production mode. This is good for self-hosting with your own changes,
or for testing the changes after developing on your own and before opening a PR.

| Service | docker-compose.yml | docker-compose-full.yml | docker-compose-local-dev-full.yml | docker-compose-local-dev.yml | docker-compose-local-build.yml |
|---------|-------------------|------------------------|------------------------------|----------------------------|------------------------------|
| postgres | ✅ | ✅ | ✅ | ✅ | ✅ |
| clickhouse | ✅ | ✅ | ✅ | ✅ | ✅ |
| rabbitmq | ❌ | ✅ | ✅ | ❌ | ✅ |
| app-server | ℹ️ | ✅ | 💻 | ℹ️ | 🔧 | 

- ✅ – service present, image is pulled from a container registry.
- 🔧 – service present, image is built from the source. This may take a while.
- ℹ️ - service present, but is a lightweight version.
- 💻 – service needs to be run manually (see below).
- ❌ – service not present.


## Running Laminar locally for development

### 0. Configure environment variables

```sh
cp .env.example .env
```

### 1. Spin up dependency containers

```sh
docker compose -f docker-compose-local-dev.yml up
```

### 2. Run app server in development mode

```sh
cd app-server
cargo r
```

Rust is compiled and not hot-reloadable, so you will need to rerun `cargo r` every time you want
to test a change.

## [Advanced] Running full stack locally for development

### 0. Configure environment variables

```sh
cp .env.example .env
```

### 1. Spin up dependency containers

```sh
docker compose -f docker-compose-local-dev-full.yml up
```

This will spin up postgres, clickhouse, and RabbitMQ.

### 2. Run app server in development mode

```sh
cd app-server
cargo r
```

### 3. After finishing your changes

Make sure everything runs well in integration in dockers.

```sh
# stop all the development servers:
# docker compose down

docker compose -f docker-compose-local-build.yml up
```

Note that this is a different Docker compose file. This one will not only spin up
dependency containers, but also build app server from local code and run it in production mode.
