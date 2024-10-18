# python-executor

This is a service which executes Python code.

## Running locally without docker

```
poetry shell
cd python_executor
# if you've updated proto files, run
python -m grpc_tools.protoc -I../proto/ --python_out=. --grpc_python_out=. --pyi_out=. ../proto/code_executor_grpc.proto

python server.py
```

## Running locally with docker

```
docker build -t python-executor .
docker run -p 8811:8811 python-executor
```
