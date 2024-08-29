# app-server

This is the main backend server containing service and application logic.

## Development

```sh
cargo run
```

You might also have to install a few packages to your system for some dependencies to work. In such case, you will get a self-explanatory error message and installation process will depend on your system.

## Env

`.env.example` is a js-dotenv-style empty example file with required environment variables. Replace urls as needed and add secrets.

## Modules overview

### API

API for external access to, e.g. run a pipeline given its id.

### DB

All interactions with database. Most submodules have the same name as their related table in the db.

### Language model

Structs and methods for (raw) interaction with language models.

### Pipeline

Core module for pipelines and engine execution.

### Routes

`actix_web` router to route requests.

### Semantic search

gRPC client for [`semantic-search-service`](https://github.com/lmnr-ai/lmnr/tree/main/semantic-search-service/)