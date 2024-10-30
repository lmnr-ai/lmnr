<a href="https://www.ycombinator.com/companies/laminar-ai">![Static Badge](https://img.shields.io/badge/Y%20Combinator-S24-orange)</a>
<a href="https://x.com/lmnrai">![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/lmnrai)</a>
<a href="https://discord.gg/nNFUUDAKub"> ![Static Badge](https://img.shields.io/badge/Join_Discord-464646?&logo=discord&logoColor=5865F2) </a>

![Frame 28 (1)](https://github.com/user-attachments/assets/217a00a1-1281-44ec-a619-15d3f2c4e994)

# Laminar

[Laminar](https://www.lmnr.ai) is an all-in-one open-source platform for engineering AI products. Trace, evaluate, label, and analyze LLM data.

- [x] Tracing
    - [x] OpenTelemetry-based automatic tracing of common AI frameworks and SDKs (LangChain, OpenAI, Anthropic ...) with just 2 lines of code. (powered by an amazing [OpenLLMetry](https://github.com/traceloop/openllmetry)).
    - [x] Trace input/output, latency, cost, token count.
    - [x] Function tracing with `observe` decorator/wrapper.
    - [x] Image tracing.
    - [ ] Audio tracing coming soon.
- [x] Evaluations
    - [x] Local offline evaluations. Run from code, terminal or as part of CI/CD.
    - [x] Online evaluations. Trigger hosted LLM-as-a-judge or Python script evaluators for each trace.
- [x] Labels
    - [x] Simple UI for fast data labeling.
- [x] Datasets
    - [x] Export production trace data to datasets.
    - [x] Run evals on hosted golden datasets.
    - [ ] Index dataset and retrieve semantically-similar dynamic few-shot examples to improve your prompts. Coming very soon.
- [x] Built for scale
    - [x] Written in Rust 🦀
    - [x] Traces are sent via gRPC, ensuring the best performance and lowest overhead.
- [x] Modern Open-Source stack
    - [x] RabbitMQ for message queue, Postgres for data, Clickhouse for analytics. Qdrant for semantic similraity search and hybrid search.
- [x] Fast and beautiful dashboards for traces / evaluations / labels.
<img width="1506" alt="traces-2" src="https://github.com/user-attachments/assets/14d6eec9-cd0e-4c3e-b601-3d64c4c0c875">

## Documentation

Check out full documentation here [docs.lmnr.ai](https://docs.lmnr.ai).

## Getting started

The fastest and easiest way to get started is with our managed platform -> [lmnr.ai](https://www.lmnr.ai)

### Self-hosting with Docker compose

For a quick start, clone the repo and start the services with docker compose:
```sh
git clone https://github.com/lmnr-ai/lmnr
cd lmnr
docker compose up -d
```

This will spin up a lightweight version of the stack with Postgres, app-server, and frontend. This is good for a quickstart 
or for lightweight usage.

For production environment, we recommend using our [managed platform](https://www.lmnr.ai/projects) or `docker compose -f docker-compose-full.yml up -d`. 

`docker-compose-full.yml` is heavy but it will enable all the features.

- app-server – core Rust backend
- rabbitmq – message queue for reliable trace processing
- qdrant – vector database
- semantic-search-service – gRPC service for embedding text and storing/retrieving it from qdrant
- frontend – NextJS frontend and backend
- python-executor – gRPC service with lightweight Python sandbox that can run arbitrary code.
- postgres – Postgres database for all the application data
- clickhouse – columnar OLAP database for more efficient trace and label analytics

## Contributing

For running and building Laminar locally, or to learn more about docker compose files,
follow the guide in [Contributing](/CONTRIBUTING.md).

## Python quickstart

First, create a project and generate a Project API Key. Then,

```sh
pip install lmnr --upgrade
echo "LMNR_PROJECT_API_KEY=<YOUR_PROJECT_API_KEY>" >> .env
```

To automatically instrument LLM calls of popular frameworks and LLM provider libraries just add
```python
from lmnr import Laminar
Laminar.initialize(project_api_key="<LMNR_PROJECT_API_KEY>")
```

To trace inputs / outputs of functions use `@observe()` decorator.

```python
import os
from openai import OpenAI

from lmnr import observe, Laminar
Laminar.initialize(project_api_key="<LMNR_PROJECT_API_KEY>")

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

@observe()  # annotate all functions you want to trace
def poem_writer(topic):
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "user", "content": f"write a poem about {topic}"},
        ],
    )
    poem = response.choices[0].message.content
    return poem

if __name__ == "__main__":
    print(poem_writer(topic="laminar flow"))
```

Running the code above will result in the following trace.

<img width="996" alt="Screenshot 2024-10-29 at 7 52 40 PM" src="https://github.com/user-attachments/assets/df141a62-b241-4e43-844f-52d94fe4ad67">

## Client libraries

To learn more about instrumenting your code, check out our client libraries:

 <a href="https://www.npmjs.com/package/@lmnr-ai/lmnr"> ![NPM Version](https://img.shields.io/npm/v/%40lmnr-ai%2Flmnr?label=lmnr&logo=npm&logoColor=CB3837) </a>
 <a href="https://pypi.org/project/lmnr/"> ![PyPI - Version](https://img.shields.io/pypi/v/lmnr?label=lmnr&logo=pypi&logoColor=3775A9) </a>
