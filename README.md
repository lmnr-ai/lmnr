# Laminar

Open-source observability and analytics for complex LLM apps. Read the [docs](https://docs.lmnr.ai).

<a href="https://www.ycombinator.com/companies/laminar-ai">![Static Badge](https://img.shields.io/badge/Y%20Combinator-S24-orange)</a>
<a href="https://x.com/lmnrai">![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/lmnrai)</a>
<a href="https://discord.gg/nNFUUDAKub"> ![Static Badge](https://img.shields.io/badge/Join_Discord-464646?&logo=discord&logoColor=5865F2) </a>

## 🚧 WORK IN PROGRESS 🚧

This is a work in progress repo. It be constantly and frequently updated.

## Getting started

### Self-hosted

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

### Managed solution

Alternatively, use our managed solution at http://www.lmnr.ai

## Sending traces and events

First, create a project and generate a Project API Key. Then prepare the client package side.

```sh
pip install lmnr
echo "LMNR_PROJECT_API_KEY=<YOUR_PROJECT_API_KEY>" >> .env
```

### Instrumenting python code

For simple instrumentation, we provide you two simple primitives:

- `observe` - a multi-purpose automatic decorator that starts traces and spans when functions are entered, and finishes them when functions return.
- `wrap_llm_call` - a function that takes in your LLM call and return a "decorated" version of it. This does all the same things as `observe`, plus
a few utilities around LLM-specific things, such as counting tokens and recording model params.

You can also import `lmnr_context` in order to interact and have more control over the context of the current span.

```python
import os
from openai import OpenAI

from lmnr import observe, wrap_llm_call, lmnr_context
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

@observe()  # annotate all functions you want to trace
def poem_writer(topic="turbulence"):
    prompt = f"write a poem about {topic}"

    # wrap the actual final call to LLM with `wrap_llm_call`
    response = wrap_llm_call(client.chat.completions.create)(
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


## Learn more

To learn more about instrumenting your code, check out our client libraries:

 <a href="https://www.npmjs.com/package/@lmnr-ai/lmnr"> ![NPM Version](https://img.shields.io/npm/v/%40lmnr-ai%2Flmnr?label=lmnr&logo=npm&logoColor=CB3837) </a>
 <a href="https://pypi.org/project/lmnr/"> ![PyPI - Version](https://img.shields.io/pypi/v/lmnr?label=lmnr&logo=pypi&logoColor=3775A9) </a>

To get deeper understanding of the concepts, follow on to the [docs](https://docs.lmnr.ai/) and [tutorials](https://docs.lmnr.ai/tutorials).
