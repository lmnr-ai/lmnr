# Contribute to Laminar

Thank you very much for showing interest in contributing to Laminar!

## How to contribute

If you want to contribute to Laminar, first check open and closed issues
for any similar items. If you can find an existing issue, only add to it if you believe
you have additional context that will help us locate and debug the issue. 

If you want to contribute your code, ask in an open issue if it can be assigned to you.
Then fork the repo, and develop locally. Once you are done with your change, submit a pull
request through your fork.

### Contributor License Agreement

When you open a pull request, CLA bot will ask you to sign our Contributor License Agreement (CLA).
We do this to avoid legal issues and disputes, and to stay compliant with relevant IP laws.

## Running Laminar locally

If you want to test your local changes, you can run code separately in
development mode.

### 0. Configure environment variables

For each of app-server, semantic-search-service, and frontend, the environment is defined
in `.env.example` files. Dupilcate those files and remove `.example` from the filename.

### 1. Spin up dependency containers

```sh
docker compose -f docker-compose-local-dev.yml up
```

This will spin up postgres, qdrant, clickhouse, and Rabbit MQ

### 2. Run semantic search service in develop mode

```sh
# semantic-search-service
cd semantic-search-service
cargo r
```

Rust is compiled and not hot reloadable, so you will need to rerun `cargo r` every time you want
to test a change.

### 3. Run app server in develop mode

```sh
# app-server
cd app-server
cargo r
```

Rust is compiled and not hot reloadable, so you will need to rerun `cargo r` every time you want
to test a change.

### 4. Run frontend in develop mode

```sh
# frontend
cd frontend
pnpm run dev
```

### 5. After finishing your changes

Make sure everything runs well in integration in dockers.

```sh
# stop all the development servers:
# docker compose down

docker compose -f docker-compose-local-build.yml up
```

Note, that this is a different Docker compose file. This one will not only spin up
dependency containers, but also build semantic search service, app server and frontend
from local code and run them in production mode.


