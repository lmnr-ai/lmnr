import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

import anthropic from "@/assets/landing/logos/anthropic.svg";
import browserUse from "@/assets/landing/logos/browser-use.svg";
import claude from "@/assets/landing/logos/claude.svg";
import gemini from "@/assets/landing/logos/gemini.svg";
import langchain from "@/assets/landing/logos/langchain.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";
import mastra from "@/assets/landing/logos/mastra.svg";
import openAi from "@/assets/landing/logos/open-ai.svg";
import openHands from "@/assets/landing/logos/open-hands.svg";
import openaiAgents from "@/assets/landing/logos/openai-agents.svg";
import opencodeSdk from "@/assets/landing/logos/opencode-sdk.svg";
import playwright from "@/assets/landing/logos/playwright.svg";
import pydanticAi from "@/assets/landing/logos/pydantic-ai.svg";
import stagehand from "@/assets/landing/logos/stagehand.svg";
import vercel from "@/assets/landing/logos/vercel.svg";
import { cn } from "@/lib/utils";

const DOCS_BASE = "https://laminar.sh/docs/tracing/integrations";

interface Integration {
  src: StaticImageData;
  alt: string;
  href: string;
  iconClassName?: string;
}

// Top integrations shown on the landing — see all in the docs.
const integrations: Integration[] = [
  { src: vercel, alt: "Vercel AI SDK", href: `${DOCS_BASE}/vercel-ai-sdk`, iconClassName: "size-3.5" },
  { src: claude, alt: "Claude Agent SDK", href: `${DOCS_BASE}/claude-agent-sdk` },
  { src: openaiAgents, alt: "OpenAI Agents SDK", href: `${DOCS_BASE}/openai-agents-sdk`, iconClassName: "size-5" },
  { src: langchain, alt: "LangChain DeepAgents", href: `${DOCS_BASE}/deepagents` },
  { src: opencodeSdk, alt: "OpenCode SDK", href: `${DOCS_BASE}/opencode` },
  { src: lightLlm, alt: "LiteLLM", href: `${DOCS_BASE}/litellm` },
  { src: mastra, alt: "Mastra", href: `${DOCS_BASE}/mastra` },
  { src: pydanticAi, alt: "Pydantic AI", href: `${DOCS_BASE}/pydantic-ai` },
  { src: openHands, alt: "OpenHands SDK", href: `${DOCS_BASE}/openhands-sdk` },
  { src: browserUse, alt: "Browser Use", href: `${DOCS_BASE}/browser-use`, iconClassName: "size-5" },
  { src: stagehand, alt: "Stagehand", href: `${DOCS_BASE}/stagehand` },
  { src: playwright, alt: "Playwright", href: `${DOCS_BASE}/playwright` },
  { src: openAi, alt: "OpenAI SDK", href: `${DOCS_BASE}/openai`, iconClassName: "size-5" },
  { src: gemini, alt: "Gemini API", href: `${DOCS_BASE}/gemini` },
  { src: anthropic, alt: "Anthropic SDK", href: `${DOCS_BASE}/anthropic` },
];

interface Props {
  className?: string;
}

// 3-column grid of integration rows (icon + name). Mirrors Figma `Frame 984`
// at 4054:8547 — three columns with 20px gap, 12px between rows. Items
// fill COLUMN-FIRST at md+ so col1 = 1–5, col2 = 6–10, col3 = 11–15 in
// source order. On mobile we drop back to a single row-major column so
// the array order matches reading order.
//
// FLAG: `md:grid-rows-5` is coupled to `integrations.length === 15`. If
// the list grows or shrinks, this number must change in lockstep or the
// column split will be wrong (e.g. 16 items would spill into a fourth
// column with one orphan). Treat the array length below as load-bearing.
const IntegrationsGrid = ({ className }: Props) => (
  <div
    className={cn(
      "grid grid-cols-1 md:grid-cols-3 md:grid-rows-5 md:grid-flow-col gap-x-5 gap-y-3 w-full max-w-[760px]",
      className
    )}
  >
    {integrations.map((integration, index) => (
      <Link
        key={`${integration.alt}-${index}`}
        href={integration.href}
        target="_blank"
        className="group flex items-center gap-4 h-7 no-underline"
      >
        <div className="flex items-center justify-center size-4 shrink-0">
          <Image
            src={integration.src}
            alt={integration.alt}
            className={cn("size-4 object-contain", integration.iconClassName)}
          />
        </div>
        <p className="font-sans-landing text-lg font-[480] text-landing-text-200 transition-colors group-hover:text-white">
          {integration.alt}
        </p>
      </Link>
    ))}
  </div>
);

export default IntegrationsGrid;
