"use client";

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
import opencode from "@/assets/landing/logos/opencode.svg";
import playwright from "@/assets/landing/logos/playwright.svg";
import pydanticAi from "@/assets/landing/logos/pydantic-ai.svg";
import vercel from "@/assets/landing/logos/vercel.svg";

interface Integration {
  name: string;
  src: StaticImageData | string;
  link: string;
}

const integrations: Integration[] = [
  {
    name: "OpenAI",
    src: openAi,
    link: "https://docs.lmnr.ai/tracing/integrations/openai",
  },
  {
    name: "Claude Agent SDK",
    src: claude,
    link: "https://docs.lmnr.ai/tracing/integrations/claude-agent-sdk",
  },
  {
    name: "Anthropic",
    src: anthropic,
    link: "https://docs.lmnr.ai/tracing/integrations/anthropic",
  },
  {
    name: "Gemini",
    src: gemini,
    link: "https://docs.lmnr.ai/tracing/integrations/gemini",
  },
  {
    name: "OpenCode",
    src: opencode,
    link: "https://docs.lmnr.ai/tracing/integrations/opencode",
  },
  {
    name: "LangChain",
    src: langchain,
    link: "https://docs.lmnr.ai/tracing/integrations/langchain",
  },
  {
    name: "Pydantic AI",
    src: pydanticAi,
    link: "https://docs.lmnr.ai/tracing/integrations/pydantic-ai",
  },
  {
    name: "Vercel AI SDK",
    src: vercel,
    link: "https://docs.lmnr.ai/tracing/integrations/vercel-ai-sdk",
  },
  {
    name: "Playwright",
    src: playwright,
    link: "https://docs.lmnr.ai/tracing/integrations/playwright",
  },
  {
    name: "Browser Use",
    src: browserUse,
    link: "https://docs.lmnr.ai/tracing/integrations/browser-use",
  },
  {
    name: "LiteLLM",
    src: lightLlm,
    link: "https://docs.lmnr.ai/tracing/integrations/litellm",
  },
  {
    name: "Mastra",
    src: mastra,
    link: "https://docs.lmnr.ai/tracing/integrations/mastra",
  },
];

interface FrameworksGridProps {
  className?: string;
  gridClassName?: string;
  itemClassName?: string;
  showLabels?: boolean;
  labelTextColor?: string;
}

export default function FrameworksGrid({
  className = "",
  gridClassName = "grid grid-cols-4 md:grid-cols-5 gap-4",
  itemClassName = "",
  showLabels = true,
  labelTextColor = "text-muted-foreground",
}: FrameworksGridProps) {
  return (
    <div className={className}>
      <div className={gridClassName}>
        {integrations.map((integration) => (
          <Link
            key={integration.name}
            rel="noopener noreferrer"
            target="_blank"
            href={integration.link}
            className={`flex flex-col items-center group w-16 ${itemClassName}`}
          >
            <div className="w-12 h-12 rounded-lg flex flex-col items-center justify-center hover:bg-white/20 transition-colors">
              <Image
                src={integration.src}
                alt={integration.name}
                width={24}
                height={24}
                className="object-contain w-6 h-6"
              />
            </div>
            {showLabels && <span className={`text-xs mt-2 text-center ${labelTextColor}`}>{integration.name}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
