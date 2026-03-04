<a href="https://www.ycombinator.com/companies/laminar-ai">![Static Badge](https://img.shields.io/badge/Y%20Combinator-S24-orange)</a>
<a href="https://x.com/lmnrai">![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/lmnrai)</a>
<a href="https://discord.gg/nNFUUDAKub"> ![Static Badge](https://img.shields.io/badge/Join_Discord-464646?&logo=discord&logoColor=5865F2) </a>

![Laminar banner](./images/laminar-banner.png)

# Laminar

[Laminar](https://laminar.sh) is an open-source observability platform purpose-built for AI agents.

- **Tracing** — OpenTelemetry-native SDK. One line of code to automatically trace Vercel AI SDK, Browser Use, Stagehand, LangChain, OpenAI, Anthropic, Gemini, and more. [Docs](https://docs.laminar.sh/tracing/introduction)
- **Evals** — Unopinionated, extensible SDK and CLI for running evals locally or in CI/CD. UI for visualizing and comparing results. [Docs](https://docs.laminar.sh/evaluations/introduction)
- **AI monitoring** — Define events with natural language descriptions to track issues, logical errors, and custom behavior of your agent. [Docs](https://docs.laminar.sh/signals)
- **SQL access** — Query traces, metrics, and events with a built-in SQL editor. Bulk create datasets from queries. Available via API. [Docs](https://docs.laminar.sh/platform/sql-editor)
- **Dashboards** — Powerful dashboard builder for traces, metrics, and events with support for custom SQL queries. [Docs](https://docs.laminar.sh/custom-dashboards/overview)
- **Data annotation & Datasets** — Custom data rendering UI for fast data annotation and dataset creation for evals. [Docs](https://docs.laminar.sh/datasets/introduction)
- **High performance** — Written in Rust with a custom realtime engine, ultra-fast full-text search, and gRPC export for tracing data.

![Traces](./images/trace-screenshot.png)

## Documentation

Full documentation is available at [docs.laminar.sh](https://docs.laminar.sh).

## Getting started

The fastest way to get started is with the managed platform at [laminar.sh](https://laminar.sh).

### Self-hosting with Docker Compose

Clone the repo and start the services:

```sh
git clone https://github.com/lmnr-ai/lmnr
cd lmnr
docker compose up -d
```

This spins up a lightweight but full-featured version of the stack. You can access the UI at http://localhost:5667.

You will also need to configure the SDK with `baseUrl` and the correct ports. See the [self-hosting guide](https://docs.laminar.sh/hosting-options#self-hosted-docker-compose).

For production, use the [managed platform](https://laminar.sh) or run `docker compose -f docker-compose-full.yml up -d`.

### Enabling the Signals feature

To enable [Signals / AI monitoring](https://docs.laminar.sh/signals) in self-hosted mode, set the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable in your `.env` file. This key is required by both the app-server and the frontend.

```sh
# In .env at the repo root
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

## TS quickstart

First, [create a project](https://laminar.sh/projects) and generate a project API key. Then install the SDK:

```sh
npm add @lmnr-ai/lmnr
```

This installs the Laminar TS SDK and all instrumentation packages (OpenAI, Anthropic, LangChain, etc.).

To start tracing LLM calls, add:

```typescript
import { Laminar } from '@lmnr-ai/lmnr';
Laminar.initialize({ projectApiKey: process.env.LMNR_PROJECT_API_KEY });
```

To trace inputs and outputs of your own functions, use the `observe` wrapper:

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

await poemWriter("laminar flow");
```

## Python quickstart

First, [create a project](https://laminar.sh/projects) and generate a project API key. Then install the SDK:

```sh
pip install --upgrade 'lmnr[all]'
```

This installs the Laminar Python SDK and all instrumentation packages. See the full list of instruments [here](https://docs.laminar.sh/installation).

To start tracing LLM calls, add:

```python
from lmnr import Laminar
Laminar.initialize(project_api_key="<LMNR_PROJECT_API_KEY>")
```

To trace inputs and outputs of your own functions, use the `@observe()` decorator:

```python
import os
from openai import OpenAI

from lmnr import observe, Laminar
Laminar.initialize(project_api_key="<LMNR_PROJECT_API_KEY>")

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

@observe()
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

 <a href="https://www.npmjs.com/package/@lmnr-ai/lmnr"> ![NPM Version](https://img.shields.io/npm/v/%40lmnr-ai%2Flmnr?label=lmnr&logo=npm&logoColor=CB3837) </a>
 <a href="https://pypi.org/project/lmnr/"> ![PyPI - Version](https://img.shields.io/pypi/v/lmnr?label=lmnr&logo=pypi&logoColor=3775A9) </a>

## Contributing

For running and building Laminar locally, or to learn more about docker compose files,
follow the guide in [Contributing](/CONTRIBUTING.md).
