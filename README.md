<a href="https://www.ycombinator.com/companies/laminar-ai">![Static Badge](https://img.shields.io/badge/Y%20Combinator-S24-orange)</a>
<a href="https://x.com/lmnrai">![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/lmnrai)</a>
<a href="https://discord.gg/nNFUUDAKub"> ![Static Badge](https://img.shields.io/badge/Join_Discord-464646?&logo=discord&logoColor=5865F2) </a>

![Laminar banner](./images/laminar-banner.png)

# Laminar

[Laminar](https://laminar.sh) is an open-source observability platform purpose-built for AI agents.

- **Tracing** -- OpenTelemetry-native SDK that auto-instruments Vercel AI SDK, Browser Use, Stagehand, LangChain, OpenAI, Anthropic, Gemini, and more with a single line of code. [Docs](https://docs.laminar.sh/tracing/introduction)
- **Evals** -- Unopinionated, extensible SDK and CLI for running evals locally or in CI/CD. UI for visualizing and comparing results. [Docs](https://docs.laminar.sh/evaluations/introduction)
- **AI monitoring** -- Define events with natural language descriptions to track issues, logical errors, and custom agent behavior. [Docs](https://docs.laminar.sh/signals)
- **SQL access** -- Query traces, metrics, and events with a built-in SQL editor. Bulk-create datasets from queries. Available via API. [Docs](https://docs.laminar.sh/platform/sql-editor)
- **Dashboards** -- Build custom dashboards over traces, metrics, and events with support for raw SQL queries. [Docs](https://docs.laminar.sh/custom-dashboards/overview)
- **Datasets & annotation** -- Custom data-rendering UI for fast annotation and dataset creation for evals. [Docs](https://docs.laminar.sh/datasets/introduction)
- **High performance** -- Written in Rust with a custom realtime engine, ultra-fast full-text search, and gRPC exporter.

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

This spins up a lightweight but full-featured version of the stack. Access the UI at `http://localhost:5667`.

You will need to configure the SDK with `baseUrl` and the correct ports -- see the [self-hosting guide](https://docs.laminar.sh/hosting-options#self-hosted-docker-compose).

For production use, we recommend the [managed platform](https://laminar.sh) or the full Docker Compose file:

```sh
docker compose -f docker-compose-full.yml up -d
```

### Enabling Signals (AI monitoring)

To enable [Signals](https://docs.laminar.sh/signals) in self-hosted mode, set the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable in your `.env` file:

```sh
# In .env at the repo root
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

## Quickstart

### TypeScript

Install the SDK:

```sh
npm add @lmnr-ai/lmnr
```

This installs Laminar and all instrumentation packages (OpenAI, Anthropic, LangChain, etc.).

Initialize tracing:

```typescript
import { Laminar } from '@lmnr-ai/lmnr';
Laminar.initialize({ projectApiKey: process.env.LMNR_PROJECT_API_KEY });
```

Use `observe` to trace function inputs and outputs:

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

### Python

Install the SDK:

```sh
pip install --upgrade 'lmnr[all]'
```

This installs Laminar and all instrumentation packages. See the full list [here](https://docs.laminar.sh/installation).

Initialize tracing:

```python
from lmnr import Laminar
Laminar.initialize(project_api_key="<LMNR_PROJECT_API_KEY>")
```

Use the `@observe()` decorator to trace function inputs and outputs:

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
    return response.choices[0].message.content

if __name__ == "__main__":
    print(poem_writer(topic="laminar flow"))
```

## Client libraries

 <a href="https://www.npmjs.com/package/@lmnr-ai/lmnr"> ![NPM Version](https://img.shields.io/npm/v/%40lmnr-ai%2Flmnr?label=lmnr&logo=npm&logoColor=CB3837) </a>
 <a href="https://pypi.org/project/lmnr/"> ![PyPI - Version](https://img.shields.io/pypi/v/lmnr?label=lmnr&logo=pypi&logoColor=3775A9) </a>

## Contributing

See [CONTRIBUTING.md](/CONTRIBUTING.md) for how to run and build Laminar locally, details on Docker Compose files, and contribution guidelines.
