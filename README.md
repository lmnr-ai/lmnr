<a href="https://www.ycombinator.com/companies/laminar-ai">![Static Badge](https://img.shields.io/badge/Y%20Combinator-S24-orange)</a>
<a href="https://x.com/lmnrai">![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/lmnrai)</a>
<a href="https://discord.gg/nNFUUDAKub"> ![Static Badge](https://img.shields.io/badge/Join_Discord-464646?&logo=discord&logoColor=5865F2) </a>

![Laminar banner](./images/laminar-banner.png)

# Laminar

[Laminar](https://laminar.sh) is an open-source observability platform purpose-built for AI agents.

- [x] Tracing. [Docs](https://docs.laminar.sh/tracing/introduction)
    - [x] Powerful, OpenTelemetry-native tracing SDK — 1 line of code to automatically trace **Vercel AI SDK, Browser Use, Stagehand, LangChain, OpenAI, Anthropic, Gemini, and more**.
- [x] Evals. [Docs](https://docs.laminar.sh/evaluations/introduction)
    - [x] Unopinionated, extensible SDK and CLI for running evals locally or in a CI/CD pipeline.
    - [x] UI for visualizing evals and comparing results.
- [x] AI monitoring. [Docs](https://docs.laminar.sh/signals)
    - [x] Define events with natural language descriptions to track issues, logical errors, and custom behavior of your agent.
- [x] SQL access to all data. [Docs](https://docs.laminar.sh/platform/sql-editor)
    - [x] Query traces, metrics, and events with a built-in SQL editor. Bulk create datasets from queries. Available via API.
- [x] Dashboards. [Docs](https://docs.laminar.sh/custom-dashboards/overview)
    - [x] Powerful dashboard builder for traces, metrics, and events with support for custom SQL queries.
- [x] Data annotation & Datasets. [Docs](https://docs.laminar.sh/datasets/introduction)
    - [x] Custom data rendering UI for fast data annotation and dataset creation for evals.
- [x] Extremely high performance.
    - [x] Written in Rust 🦀
    - [x] Custom realtime engine for viewing traces as they happen.
    - [x] Ultra-fast full-text search over span data.
    - [x] gRPC exporter for tracing data.

![Traces](./images/trace-screenshot.png)

## Documentation

Check out the full documentation at [docs.laminar.sh](https://docs.laminar.sh).

## Getting started

The fastest way to get started is with the managed platform at [laminar.sh](https://laminar.sh).

### Self-hosting with Docker compose

To self-host locally, clone the repo and start the services with Docker Compose:
```sh
git clone https://github.com/lmnr-ai/lmnr
cd lmnr
docker compose up -d
```

This spins up a lightweight, full-featured version of the stack. Access the UI at http://localhost:5667.

You will also need to configure the SDK with the correct `baseUrl` and ports. See the [self-hosting guide](https://docs.laminar.sh/hosting-options#self-hosted-docker-compose).

For a production environment, we recommend the [managed platform](https://laminar.sh) or `docker compose -f docker-compose-full.yml up -d`.

### Enabling the Signals feature

To enable [Signals / AI monitoring](https://docs.laminar.sh/signals) in self-hosted mode, set the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable in your `.env` file. This key is required by both the app-server and the frontend.

```sh
# In .env at the repo root
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

## Pricing

Laminar offers four pricing tiers on the [managed platform](https://laminar.sh/pricing):

| | **Free** | **Hobby** | **Pro** | **Enterprise** |
|---|---|---|---|---|
| **Price** | $0 / month | $30 / month | $150 / month | Custom |
| **Data included** | 1 GB (no overage) | 3 GB (then $2 / GB) | 10 GB (then $1.50 / GB) | Custom limits |
| **Signal runs** | 100 (no overage) | 1,000 (then $0.02 / run) | 10,000 (then $0.015 / run) | Custom limits |
| **Retention** | 15 days | 30 days | 90 days | Custom |
| **Projects** | 1 | Unlimited | Unlimited | Unlimited |
| **Seats** | 1 | Unlimited | Unlimited | Unlimited |
| **Support** | Community | Email | Slack | Dedicated |
| **On-premise** | - | - | - | Yes |

Self-hosting is always free. See [Self-hosting with Docker compose](#self-hosting-with-docker-compose) above.

## Contributing

For running and building Laminar locally, or to learn more about docker compose files,
follow the guide in [Contributing](/CONTRIBUTING.md).

## TS quickstart

First, [create a project](https://laminar.sh/projects) and generate a project API key. Then,

```sh
npm add @lmnr-ai/lmnr
```

This installs the Laminar TS SDK and all instrumentation packages (OpenAI, Anthropic, LangChain, etc.).

To start tracing LLM calls, add:
```typescript
import { Laminar } from '@lmnr-ai/lmnr';
Laminar.initialize({ projectApiKey: process.env.LMNR_PROJECT_API_KEY });
```

To trace inputs / outputs of functions use `observe` wrapper.

```typescript
import { OpenAI } from 'openai';
import { observe } from '@lmnr-ai/lmnr';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const poemWriter = observe({name: 'poemWriter'}, async (topic) => {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `write a poem about ${topic}` }],
  });
  return response.choices[0].message.content;
});

await poemWriter();
```

## Python quickstart

First, [create a project](https://laminar.sh/projects) and generate a project API key. Then,

```sh
pip install --upgrade 'lmnr[all]'
```
This installs the Laminar Python SDK and all instrumentation packages. See the full list of supported instruments [here](https://docs.laminar.sh/installation).


To start tracing LLM calls, add:
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

## Client libraries

To learn more about instrumenting your code, check out our client libraries:

 <a href="https://www.npmjs.com/package/@lmnr-ai/lmnr"> ![NPM Version](https://img.shields.io/npm/v/%40lmnr-ai%2Flmnr?label=lmnr&logo=npm&logoColor=CB3837) </a>
 <a href="https://pypi.org/project/lmnr/"> ![PyPI - Version](https://img.shields.io/pypi/v/lmnr?label=lmnr&logo=pypi&logoColor=3775A9) </a>
