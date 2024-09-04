<a href="https://www.ycombinator.com/companies/laminar-ai">![Static Badge](https://img.shields.io/badge/Y%20Combinator-S24-orange)</a>
<a href="https://x.com/lmnrai">![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/lmnrai)</a>
<a href="https://discord.gg/nNFUUDAKub"> ![Static Badge](https://img.shields.io/badge/Join_Discord-464646?&logo=discord&logoColor=5865F2) </a>

## Laminar - Open-Source observability, analytics, evals and prompt chains for complex LLM apps.
<img width="1439" alt="traces" src="https://github.com/user-attachments/assets/88e1f801-1dbf-4e5b-af71-1a3923661cd1">


Think of it as DataDog + PostHog for LLM apps.

- OpenTelemetry-based instrumentation: automatic for LLM / vector DB calls with just 2 lines of code + decorators to track functions (powered by an amazing [OpenLLMetry](https://github.com/traceloop/openllmetry) open-source package by TraceLoop).
- Semantic events-based analytics. Laminar hosts background job queues of LLM pipelines. Outputs of those pipelines are turned into metrics. For example, you can design a pipeline which extracts "my AI drive-through agent made an upsell" data, and track this metric in Laminar.
- Built for scale with a modern stack: written in Rust, RabbitMQ for message queue, Postgres for data, Clickhouse for analytics
- Insightful, fast dashboards for traces / spans / events

Read the [docs](https://docs.lmnr.ai).

This is a work in progress repo and it will be frequently updated.

## Getting started

### Laminar Cloud
The easiest way to get started is with a generous free tier on our managed platform -> [https://www.lmnr.ai](lmnr.ai)

### Self-hosting with Docker compose

Start local version with docker compose.
```sh
git clone git@github.com:lmnr-ai/lmnr
cd lmnr
docker compose up
```

This will spin up the following containers:
- app-server – the core app logic, backend, and the LLM proxies
- rabbitmq – message queue for sending the traces and observations reliably
- qdrant – vector database
- semantic-search-service – service for interacting with qdrant and embeddings
- frontend – the visual front-end dashboard for interacting with traces
- postgres – the database for all the application data
- clickhouse – columnar OLAP database for more efficient event and trace analytics

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

You can send events in two ways:
- `.event(name, value)` – instant event with a value.
- `.evaluate_event(name, evaluator, data)` –  event that is evaluated by evaluator pipeline based on the data.

Note that to run an evaluate event, you need to crate an evaluator pipeline and create a target version for it. 

Laminar processes background job queues of pipeline processes and records outputs of pipelines as events.

Read our [docs](https://docs.lmnr.ai) to learn more about event types and how they are created and evaluated.

```python
from lmnr import Laminar as L
# ...
poem = response.choices[0].message.content

# this will register True or False value with Laminar
L.event("topic alignment", topic in poem)

# this will run the pipeline `check_wordy` with `poem` set as the value
# of `text_input` node, and write the result as an event with name
# "excessive_wordiness"
L.evaluate_event("excessive_wordiness", "check_wordy", {"text_input": poem})
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

To get deeper understanding of the concepts, follow on to the [docs](https://docs.lmnr.ai/) and [tutorials](https://docs.lmnr.ai/tutorials).
