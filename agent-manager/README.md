# Agent manager

This package is responsible for calling the agent and managing browsers

## Required environment

Scrapybara API Key – currently the browsers are created in [Scrapybara](https://scrapybara.com/),
you can create an API key there and use their browsers.

Anthropic API Key – the agent currently calls Anthropic for LLM.

## Development

1. `uv lock && uv sync`
1. `python -m grpc_tools.protoc -I../proto/ --python_out=. --grpc_python_out=. --pyi_out=. ../proto/agent_manager_grpc.proto`