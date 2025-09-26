# Query Engine

## Setup

1. Generate protobuf files:
   ```bash
   cd src
   uv run python -m grpc_tools.protoc -I../proto/ --python_out=. --grpc_python_out=. --pyi_out=. ../proto/query_engine.proto
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

## Run

### gRPC Server
```bash
uv run python server.py
```
