// Import logos
import browserUse from "@/assets/landing/logos/browser-use.svg";
import claude from "@/assets/landing/logos/claude.svg";
import langgraph from "@/assets/landing/logos/langgraph.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";
import vercel from "@/assets/landing/logos/vercel.svg";

export type Integration = "browser-use" | "claude" | "vercel" | "langgraph" | "light-llm";

export interface IntegrationData {
  name: string;
  logoSrc: string;
  alt: string;
  typescript?: string;
  python?: string;
  highlightedLines: number[]; // 0-indexed line numbers
}

export const integrations: Record<Integration, IntegrationData> = {
  "browser-use": {
    name: "Browser Use",
    logoSrc: browserUse,
    alt: "Browser Use",
    highlightedLines: [4, 6],
    python: `from langchain_anthropic import ChatAnthropic
from browser_use import Agent
import asyncio

from lmnr import Laminar

Laminar.initialize(project_api_key="...")

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
    highlightedLines: [3, 8, 10],
    python: `import asyncio
import os
from dotenv import load_dotenv
from lmnr import Laminar, observe
from claude_agent_sdk import ClaudeSDKClient

load_dotenv()
del os.environ["ANTHROPIC_API_KEY"]
Laminar.initialize()

@observe()
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
  langgraph: {
    name: "LangChain",
    logoSrc: langgraph,
    alt: "LangChain",
    highlightedLines: [1, 6],
    python: `from dotenv import load_dotenv
from lmnr import Laminar
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()
Laminar.initialize()

model = ChatOpenAI(model="gpt-4o-mini")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("human", "{question}")
])
chain = prompt | model
response = chain.invoke({"question": "What is the capital of France?"})
print(response.content)`,
  },
  "light-llm": {
    name: "LiteLLM",
    logoSrc: lightLlm,
    alt: "LiteLLM",
    highlightedLines: [2, 5, 6],
    python: `from dotenv import load_dotenv
import litellm
from lmnr import Laminar, LaminarLiteLLMCallback

load_dotenv()
Laminar.initialize()
litellm.callbacks = [LaminarLiteLLMCallback()]

response = litellm.completion(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "What is the capital of France?"}],
)
print(response.choices[0].message.content)`,
  },
};
