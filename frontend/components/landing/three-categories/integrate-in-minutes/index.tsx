"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

import browserUse from "@/assets/landing/logos/browser-use.svg";
import claude from "@/assets/landing/logos/claude.svg";
import gemini from "@/assets/landing/logos/gemini.svg";
import langchain from "@/assets/landing/logos/langchain.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";
import mastra from "@/assets/landing/logos/mastra.svg";
import openAi from "@/assets/landing/logos/open-ai.svg";
import openHands from "@/assets/landing/logos/open-hands.svg";
import openTelemetry from "@/assets/landing/logos/open-telemetry.svg";
import openaiAgents from "@/assets/landing/logos/openai-agents.svg";
import opencodeSdk from "@/assets/landing/logos/opencode-sdk.svg";
import playwright from "@/assets/landing/logos/playwright.svg";
import pydanticAi from "@/assets/landing/logos/pydantic-ai.svg";
import stagehand from "@/assets/landing/logos/stagehand.svg";
import vercel from "@/assets/landing/logos/vercel.svg";
import { cn } from "@/lib/utils";

import { subsectionTitle } from "../../class-names";
import DocsButton from "../../docs-button";

interface Props {
  className?: string;
}

interface Integration {
  src: StaticImageData;
  alt: string;
  href: string;
  iconClassName?: string;
}

const DOCS_BASE = "https://laminar.sh/docs/tracing/integrations";

// Placeholder list — will be curated before launch.
const integrations: Integration[] = [
  { src: claude, alt: "Claude Agent SDK", href: `${DOCS_BASE}/claude-agent-sdk` },
  { src: openaiAgents, alt: "OpenAI Agents SDK", href: `${DOCS_BASE}/openai-agents-sdk`, iconClassName: "size-5" },
  { src: vercel, alt: "Vercel AI SDK", href: `${DOCS_BASE}/vercel-ai-sdk`, iconClassName: "size-3.5" },
  { src: langchain, alt: "LangChain Deep Agents", href: `${DOCS_BASE}/langchain` },
  { src: pydanticAi, alt: "Pydantic AI", href: `${DOCS_BASE}/pydantic-ai` },
  { src: mastra, alt: "Mastra", href: `${DOCS_BASE}/mastra` },
  { src: opencodeSdk, alt: "OpenCode SDK", href: `${DOCS_BASE}/opencode` },
  { src: openHands, alt: "OpenHands SDK", href: `${DOCS_BASE}/openhands-sdk` },
  { src: browserUse, alt: "Browser Use", href: `${DOCS_BASE}/browser-use`, iconClassName: "size-5" },
  { src: stagehand, alt: "Stagehand", href: `${DOCS_BASE}/stagehand` },
  { src: playwright, alt: "Playwright", href: `${DOCS_BASE}/playwright` },
  { src: openAi, alt: "OpenAI SDK", href: `${DOCS_BASE}/openai`, iconClassName: "size-5" },
  { src: claude, alt: "Anthropic SDK", href: `${DOCS_BASE}/anthropic` },
  { src: gemini, alt: "Gemini API", href: `${DOCS_BASE}/gemini` },
  { src: lightLlm, alt: "LiteLLM", href: `${DOCS_BASE}/litellm` },
  { src: openTelemetry, alt: "OpenTelemetry", href: "https://laminar.sh/docs/tracing/otel" },
];

const IntegrateInMinutes = ({ className }: Props) => (
  <div className={cn("flex flex-col items-start w-full md:gap-[54px] gap-8", className)}>
    <h2 className={cn(subsectionTitle, "max-w-[833px]")}>
      Two lines to integrate
      <br />
      with your stack
    </h2>
    <div className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 md:gap-x-5 gap-x-4 md:gap-y-3 gap-y-2">
      {integrations.map((integration, index) => (
        <Link
          key={`${integration.alt}-${index}`}
          href={integration.href}
          target="_blank"
          className="group flex items-center gap-8 h-7 no-underline"
        >
          <div className="flex items-center justify-center size-4 shrink-0">
            <Image
              src={integration.src}
              alt={integration.alt}
              className={cn("size-4 object-contain", integration.iconClassName)}
            />
          </div>
          <p className="font-sans text-base leading-7 text-landing-text-300 transition-colors group-hover:text-white">
            {integration.alt}
          </p>
        </Link>
      ))}
    </div>
    <DocsButton href={`${DOCS_BASE}/overview`} />
  </div>
);

export default IntegrateInMinutes;
