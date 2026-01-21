// Import logos
import browserUse from "@/assets/landing/logos/browser-use.svg";
import claude from "@/assets/landing/logos/claude.svg";
import langgraph from "@/assets/landing/logos/langgraph.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";
import openHands from "@/assets/landing/logos/open-hands.svg";
import vercel from "@/assets/landing/logos/vercel.svg";

export type Integration = "browser-use" | "claude" | "vercel" | "langgraph" | "light-llm" | "open-hands";

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
