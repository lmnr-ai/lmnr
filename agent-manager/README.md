## Development

1. `uv lock && uv sync`
1. `python -m grpc_tools.protoc -I../proto/ --python_out=. --grpc_python_out=. --pyi_out=. ../proto/agent_manager_grpc.proto`