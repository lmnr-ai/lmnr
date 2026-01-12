// Import logos
import browserUse from "@/assets/landing/logos/browser-use.svg";
import vercel from "@/assets/landing/logos/vercel.svg";
import langgraph from "@/assets/landing/logos/langgraph.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";

export type Integration = "browser-use" | "vercel" | "langgraph" | "light-llm";

export interface IntegrationData {
  name: string;
  logoSrc: string;
  alt: string;
  typescript?: string;
  python?: string;
}

export const integrations: Record<Integration, IntegrationData> = {
  "browser-use": {
    name: "Browser Use",
    logoSrc: browserUse,
    alt: "Browser Use",
    python: `from langchain_anthropic import ChatAnthropic
from browser_use import Agent
import asyncio

from lmnr import Laminar
# this line instruments Browser Use and playwright browser
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
  vercel: {
    name: "Vercel AI SDK",
    logoSrc: vercel,
    alt: "Vercel AI SDK",
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
    python: `from lmnr import Laminar
from dotenv import load_dotenv
# other imports...

load_dotenv()

# Initialize Laminar - this single step enables automatic tracing
Laminar.initialize()

model = ChatOpenAI()
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("human", "{question}")
])
output_parser = StrOutputParser()

chain = prompt | model | output_parser

response = chain.invoke({"question": "What is the capital of France?"})
print(response)`,
  },
  "light-llm": {
    name: "LiteLLM",
    logoSrc: lightLlm,
    alt: "LiteLLM",
    python: `import litellm
from lmnr import Laminar, LaminarLiteLLMCallback

Laminar.initialize(project_api_key="LMNR_PROJECT_API_KEY")
litellm.callbacks = [LaminarLiteLLMCallback()]

response = litellm.completion(
    model="gpt-4.1-nano",
    messages=[
      {"role": "user", "content": "What is the capital of France?"}
    ],
)`,
  },
};
