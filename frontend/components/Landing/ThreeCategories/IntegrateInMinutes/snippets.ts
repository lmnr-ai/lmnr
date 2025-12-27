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
    typescript: `// TODO: actual snippet please
import { Laminar } from "@lmnr-ai/sdk";

const laminar = new Laminar({
  apiKey: process.env.LAMINAR_API_KEY,
});

// Your agent code here
const agent = await laminar.trace("agent.run", async () => {
  // Browser automation code
});`,
    python: `# TODO: actual snippet please
from lmnr import Laminar

laminar = Laminar(api_key=os.getenv("LAMINAR_API_KEY"))

# Your agent code here
with laminar.trace("agent.run"):
    # Browser automation code
    pass`,
  },
  vercel: {
    name: "Vercel",
    logoSrc: vercel,
    alt: "Vercel",
    typescript: `// TODO: actual snippet please
import { Laminar } from "@lmnr-ai/sdk";

const laminar = new Laminar({
  apiKey: process.env.LAMINAR_API_KEY,
});

export default async function handler(req: Request) {
  return await laminar.trace("api.handler", async () => {
    // Your API handler code
  });
}`,
  },
  langgraph: {
    name: "LangGraph",
    logoSrc: langgraph,
    alt: "LangGraph",
    typescript: `// TODO: actual snippet please
import { Laminar } from "@lmnr-ai/sdk";
import { StateGraph } from "@langchain/langgraph";

const laminar = new Laminar({
  apiKey: process.env.LAMINAR_API_KEY,
});

const workflow = new StateGraph({
  // Your LangGraph workflow
});`,
    python: `# TODO: actual snippet please
from lmnr import Laminar
from langgraph.graph import StateGraph

laminar = Laminar(api_key=os.getenv("LAMINAR_API_KEY"))

workflow = StateGraph({
    # Your LangGraph workflow
})`,
  },
  "light-llm": {
    name: "Light LLM",
    logoSrc: lightLlm,
    alt: "Light LLM",
    python: `# TODO: actual snippet please
from lmnr import Laminar

laminar = Laminar(api_key=os.getenv("LAMINAR_API_KEY"))

# Your agent code here
with laminar.trace("agent.run"):
    # Light LLM integration code
    pass`,
  },
};
