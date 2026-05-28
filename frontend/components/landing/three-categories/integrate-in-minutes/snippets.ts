// Import logos
import browserUse from "@/assets/landing/logos/browser-use.svg";
import claude from "@/assets/landing/logos/claude.svg";
import langchain from "@/assets/landing/logos/langchain.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";
import mastra from "@/assets/landing/logos/mastra.svg";
import openHands from "@/assets/landing/logos/open-hands.svg";
import openaiAgents from "@/assets/landing/logos/openai-agents.svg";
import opencodeSdk from "@/assets/landing/logos/opencode-sdk.svg";
import pydanticAi from "@/assets/landing/logos/pydantic-ai.svg";
import vercel from "@/assets/landing/logos/vercel.svg";

export type Integration =
  | "browser-use"
  | "claude"
  | "vercel"
  | "langchain"
  | "light-llm"
  | "open-hands"
  | "mastra"
  | "openai-agents-sdk"
  | "pydantic-ai"
  | "opencode-sdk";

export interface IntegrationData {
  name: string;
  logoSrc: string;
  alt: string;
  typescript?: string;
  python?: string;
  highlightedLines: number[]; // 0-indexed line numbers
  screenshot: string;
  docsUrl: string;
}

export const integrations: Record<Integration, IntegrationData> = {
  "browser-use": {
    name: "Browser Use",
    logoSrc: browserUse,
    alt: "Browser Use",
    highlightedLines: [4, 6],
    screenshot: "/assets/landing/snippet-screenshots/browser-use.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/browser-use",
    python: `from langchain_anthropic import ChatAnthropic
from browser_use import Agent
import asyncio

from lmnr import Laminar

Laminar.initialize()

async def main():
    agent = Agent(
        task="go to ycombinator.com, describe 5 companies from the latest batch of startups.",
        llm=ChatAnthropic(model="claude-3-7-sonnet-20250219")
    )
    result = await agent.run()
    print(result)

asyncio.run(main())`,
  },
  claude: {
    name: "Claude",
    logoSrc: claude,
    alt: "Claude",
    highlightedLines: [3, 7],
    screenshot: "/assets/landing/snippet-screenshots/claude-agent-sdk.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/claude-agent-sdk",
    python: `import asyncio
import os
from dotenv import load_dotenv
from lmnr import Laminar, observe
from claude_agent_sdk import ClaudeSDKClient

load_dotenv()
Laminar.initialize()

async def main():
    async with ClaudeSDKClient() as client:
        await client.query("What is the capital of France?")
        async for msg in client.receive_messages():
            print(msg)

asyncio.run(main())`,
  },
  vercel: {
    name: "Vercel AI SDK",
    logoSrc: vercel,
    alt: "Vercel AI SDK",
    highlightedLines: [2, 9],
    screenshot: "/assets/landing/snippet-screenshots/vercel-ai-sdk.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/vercel-ai-sdk",
    typescript: `import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { getTracer } from '@lmnr-ai/lmnr';

const { text } = await generateText({
  model: openai('gpt-4.1-nano'),
  prompt: 'What is Laminar flow?',
  experimental_telemetry: {
    isEnabled: true,
    tracer: getTracer(),
  },
});`,
  },
  "open-hands": {
    name: "OpenHands",
    logoSrc: openHands,
    alt: "OpenHands",
    highlightedLines: [6, 7],
    screenshot: "/assets/landing/snippet-screenshots/open-hands.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/openhands-sdk",
    python: `import os
from openhands.sdk import LLM, Agent, Conversation, Tool
from openhands.tools.file_editor import FileEditorTool
from openhands.tools.task_tracker import TaskTrackerTool
from openhands.tools.terminal import TerminalTool

from lmnr import Laminar
Laminar.initialize()

llm = LLM(
  model="anthropic/claude-sonnet-4-20250514",
  api_key=os.getenv("ANTHROPIC_API_KEY"),
)

agent = Agent(
  llm=llm,
  tools=[
      Tool(name=TerminalTool.name),
      Tool(name=FileEditorTool.name),
      Tool(name=TaskTrackerTool.name),
  ],
)

conversation = Conversation(agent=agent, workspace=os.getcwd())
conversation.send_message("Build a simple todo app")`,
  },
  langchain: {
    name: "LangChain",
    logoSrc: langchain,
    alt: "LangChain",
    highlightedLines: [0, 12],
    screenshot: "/assets/landing/snippet-screenshots/lang-chain.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/langchain",
    python: `from lmnr import Laminar
from dotenv import load_dotenv
import os
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated, Sequence
import operator

load_dotenv()
Laminar.initialize()

model = ChatOpenAI()
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("human", "{question}")
])
output_parser = StrOutputParser()

chain = prompt | model | output_parser`,
  },
  "light-llm": {
    name: "LiteLLM",
    logoSrc: lightLlm,
    alt: "LiteLLM",
    highlightedLines: [2, 5],
    screenshot: "/assets/landing/snippet-screenshots/lite-llm.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/litellm",
    python: `from dotenv import load_dotenv
import litellm
from lmnr import Laminar

load_dotenv()
Laminar.initialize()

response = litellm.completion(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "What is the capital of France?"}],
)
print(response.choices[0].message.content)`,
  },
  mastra: {
    name: "Mastra",
    logoSrc: mastra,
    alt: "Mastra",
    highlightedLines: [4, 7, 19, 20, 21, 22],
    screenshot: "/assets/landing/snippet-screenshots/mastra.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/mastra",
    typescript: `import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Observability } from '@mastra/observability';
import { Laminar, MastraExporter } from '@lmnr-ai/lmnr';
import 'dotenv/config';

Laminar.initialize();

const agent = new Agent({
  id: 'assistant',
  name: 'assistant',
  instructions: 'You are a concise, friendly assistant.',
  model: openai('gpt-5-mini'),
});

const observability = new Observability({
  default: { enabled: false },
  configs: {
    laminar: {
      serviceName: 'my-mastra-app',
      exporters: [new MastraExporter()],
    },
  },
});

new Mastra({ agents: { assistant: agent }, observability });

const result = await agent.generate('Write a two-line haiku about tracing.');
console.log(result.text);`,
  },
  "openai-agents-sdk": {
    name: "OpenAI Agents SDK",
    logoSrc: openaiAgents,
    alt: "OpenAI Agents SDK",
    highlightedLines: [3, 5, 7],
    screenshot: "/assets/landing/snippet-screenshots/openai-agents-sdk.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/openai-agents-sdk",
    python: `import asyncio

from agents import Agent, Runner
from lmnr import Laminar, observe

Laminar.initialize()

@observe(name="math-homework")
async def main():
    agent = Agent(
        name="MathHelper",
        instructions="You are a patient math tutor. Explain each step clearly.",
        model="gpt-5-mini",
    )
    result = await Runner.run(agent, "A train leaves Boston at 9am at 60 mph...")
    print(result.final_output)

if __name__ == "__main__":
    asyncio.run(main())`,
  },
  "pydantic-ai": {
    name: "Pydantic AI",
    logoSrc: pydanticAi,
    alt: "Pydantic AI",
    highlightedLines: [3, 5, 12],
    screenshot: "/assets/landing/snippet-screenshots/pydantic-ai.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/pydantic-ai",
    python: `import asyncio

from pydantic_ai import Agent
from lmnr import Laminar, observe

Laminar.initialize()

agent = Agent(
    "openai:gpt-5-mini",
    system_prompt="You are a concise assistant. Answer in one sentence.",
)

@observe(name="capital-lookup")
async def main():
    result = await agent.run("What is the capital of France?")
    print(result.output)

if __name__ == "__main__":
    asyncio.run(main())`,
  },
  "opencode-sdk": {
    name: "OpenCode SDK",
    logoSrc: opencodeSdk,
    alt: "OpenCode SDK",
    highlightedLines: [1, 3, 4, 5, 6, 7, 14, 25],
    screenshot: "/assets/landing/snippet-screenshots/opencode-sdk.png",
    docsUrl: "https://laminar.sh/docs/tracing/integrations/opencode",
    typescript: `import * as opencode from "@opencode-ai/sdk";
import { Laminar, observe } from "@lmnr-ai/lmnr";

Laminar.initialize({
  instrumentModules: {
    opencode,
  },
});

const { client, server } = await opencode.createOpencode();

try {
  const sessionRes = await client.session.create({ body: { title: "agent run" } });

  await observe({ name: "my-agent-step" }, async () => {
    await client.session.prompt({
      path: { id: sessionRes.data.id },
      body: {
        model: { providerID: "anthropic", modelID: "claude-haiku-4-5" },
        parts: [{ type: "text", text: "Create a Python factorial function and test it." }],
      },
    });
  });
} finally {
  server.close();
  await Laminar.shutdown();
}`,
  },
};
