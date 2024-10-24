<a href="https://www.ycombinator.com/companies/laminar-ai">![Static Badge](https://img.shields.io/badge/Y%20Combinator-S24-orange)</a>
<a href="https://x.com/lmnrai">![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/lmnrai)</a>
<a href="https://discord.gg/nNFUUDAKub"> ![Static Badge](https://img.shields.io/badge/Join_Discord-464646?&logo=discord&logoColor=5865F2) </a>

# Laminar - LLM engineering from first principles

Laminar is an open-source platform for engineering LLM products. Trace, evaluate, annotate, and analyze LLM data. Bring LLM applications to production with confidence.
<img width="1445" alt="Screenshot 2024-09-25 at 8 58 56 PM" src="https://github.com/user-attachments/assets/f6bd4208-6380-42c6-9ede-47ebc81a3d25">


Think of it as DataDog + PostHog for LLM apps.

- OpenTelemetry-based instrumentation: automatic for LLM / vector DB calls with just 2 lines of code + decorators to track functions (powered by an amazing [OpenLLMetry](https://github.com/traceloop/openllmetry) open-source package by TraceLoop).
- Online evaluations: Laminar can host your custom evaluation code or prompts and run them as your application traces arrive.
- Built for scale with a modern stack: written in Rust, RabbitMQ for message queue, Postgres for data, Clickhouse for analytics.
- Insightful, fast dashboards for traces / spans / events / evaluations.

Read the [docs](https://docs.lmnr.ai).

This is a work in progress repo and it will be frequently updated.

## Getting started

### Laminar Cloud

The easiest way to get started is with a generous free tier on our managed platform -> [lmnr.ai](https://www.lmnr.ai)

### Self-hosting with Docker compose

Start local version with docker compose.
```sh
git clone https://github.com/lmnr-ai/lmnr
cd lmnr
docker compose up
```

This will spin up the following containers:
- app-server – the core app logic, backend, and the LLM proxies
- rabbitmq – message queue for sending the traces and observations reliably
- qdrant – vector database
- semantic-search-service – service for interacting with qdrant and embeddings
- frontend – the visual front-end dashboard for interacting with traces
- python-executor – a small python sandbox that can run arbitrary code wrapped under a thin gRPC service
- postgres – the database for all the application data
- clickhouse – columnar OLAP database for more efficient event, label, and trace analytics

#### Local development

The simple set up above will pull latest Laminar images from Github Container Registry.

For running and building Laminar locally, follow the guide in [Contributing](/CONTRIBUTING.md).

### Instrumenting Python code

First, create a project and generate a Project API Key. Then,

```sh
pip install lmnr
echo "LMNR_PROJECT_API_KEY=<YOUR_PROJECT_API_KEY>" >> .env
```

To automatically instrument LLM calls of popular frameworks and LLM provider libraries just add
```python
from lmnr import Laminar as L
L.initialize(project_api_key="<LMNR_PROJECT_API_KEY>")
```

In addition to automatic instrumentation, we provide a simple `@observe()` decorator, if you want to trace inputs / outputs of functions
#### Example

```python
import os
from openai import OpenAI

from lmnr import observe, Laminar as L
L.initialize(project_api_key="<LMNR_PROJECT_API_KEY>")

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

@observe()  # annotate all functions you want to trace
def poem_writer(topic="turbulence"):
    prompt = f"write a poem about {topic}"
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
    )
    poem = response.choices[0].message.content
    return poem

if __name__ == "__main__":
    print(poem_writer(topic="laminar flow"))
```


#### Sending events

To send an event, call `L.event(name, value)`.

Read our [docs](https://docs.lmnr.ai) to learn more about events and how they are created.

```python
from lmnr import Laminar as L
# ...
poem = response.choices[0].message.content

# this will register True or False value with Laminar
L.event("topic alignment", topic in poem)
```

#### Laminar pipelines as prompt chain managers

You can create Laminar pipelines in the UI and manage chains of LLM calls there.

After you are ready to use your pipeline in your code, deploy it in Laminar by selecting the target version for the pipeline.

Once your pipeline target is set, you can call it from Python in just a few lines.

```python
from lmnr import Laminar as L

L.initialize('<YOUR_PROJECT_API_KEY>')

result = l.run(
    pipeline = 'my_pipeline_name',
    inputs = {'input_node_name': 'some_value'},
    # all environment variables
    env = {'OPENAI_API_KEY': 'sk-some-key'},
)
```

## Learn more

To learn more about instrumenting your code, check out our client libraries:

 <a href="https://www.npmjs.com/package/@lmnr-ai/lmnr"> ![NPM Version](https://img.shields.io/npm/v/%40lmnr-ai%2Flmnr?label=lmnr&logo=npm&logoColor=CB3837) </a>
 <a href="https://pypi.org/project/lmnr/"> ![PyPI - Version](https://img.shields.io/pypi/v/lmnr?label=lmnr&logo=pypi&logoColor=3775A9) </a>

To get deeper understanding of the concepts, follow on to the [docs](https://docs.lmnr.ai/).
