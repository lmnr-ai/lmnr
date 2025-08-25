"use client";

import Link from "next/link";
import { ReactNode } from "react";

import {
  IconAmazonBedrock,
  IconAnthropic,
  IconBrowserUse,
  IconCrewAI,
  IconGemini,
  IconGroq,
  IconLangchain,
  IconMistral,
  IconOpenAI,
  IconOpenTelemetry,
  IconPlaywright,
  IconVercel,
} from "../ui/icons";

interface Integration {
  name: string;
  icon?: ReactNode;
  emoji?: string;
  link: string;
}

const integrations: Integration[] = [
  {
    name: "OpenTelemetry",
    icon: <IconOpenTelemetry className="h-10 w-10 xl:h-10 xl:w-10 2xl:h-16 2xl:w-16" />,
    link: "https://docs.lmnr.ai/tracing/integrations/opentelemetry",
  },
  {
    name: "LangGraph",
    icon: <IconLangchain className="h-12 w-12 xl:h-12 xl:w-12 2xl:h-20 2xl:w-20" />,
    link: "https://docs.lmnr.ai/tracing/integrations/langchain",
  },
  {
    name: "CrewAI",
    icon: <IconCrewAI className="h-10 w-10 xl:h-10 xl:w-10 2xl:h-16 2xl:w-16" />,
    link: "https://docs.lmnr.ai/tracing/integrations/crewai",
  },
  {
    name: "AI SDK",
    icon: <IconVercel className="h-8 w-8 xl:h-8 xl:w-8 2xl:h-12 2xl:w-12" />,
    link: "https://docs.lmnr.ai/tracing/integrations/vercel-ai-sdk",
  },
  {
    name: "LiteLLM",
    emoji: "🚅",
    link: "https://docs.lmnr.ai/tracing/integrations/litellm",
  },
  {
    name: "Browser Use",
    icon: <IconBrowserUse className="h-9 w-9 xl:h-9 xl:w-9 2xl:h-14 2xl:w-14" />,
    link: "https://docs.lmnr.ai/tracing/integrations/browser-use",
  },
  {
    name: "StageHand",
    emoji: "🤘",
    link: "https://docs.lmnr.ai/tracing/integrations/stagehand",
  },
  {
    name: "Playwright",
    icon: <IconPlaywright className="h-10 w-10 xl:h-10 xl:w-10 2xl:h-16 2xl:w-16" />,
    link: "https://docs.lmnr.ai/tracing/integrations/playwright",
  },
  {
    name: "OpenAI",
    icon: <IconOpenAI className="h-10 w-10 xl:h-10 xl:w-10 2xl:h-16 2xl:w-16" />,
    link: "https://docs.lmnr.ai/tracing/integrations/openai",
  },
  {
    name: "Anthropic",
    icon: <IconAnthropic className="h-10 w-10 xl:h-10 xl:w-10 2xl:h-16 2xl:w-16" />,
    link: "https://docs.lmnr.ai/tracing/integrations/anthropic",
  },
  {
    name: "Gemini",
    icon: <IconGemini className="h-10 w-10 xl:h-10 xl:w-10 2xl:h-16 2xl:w-16" />,
    link: "https://docs.lmnr.ai/tracing/integrations/gemini",
  },
  {
    name: "Mistral",
    icon: <IconMistral className="h-10 w-10 xl:h-10 xl:w-10 2xl:h-16 2xl:w-16" />,
    link: "https://docs.lmnr.ai/tracing/integrations/mistral",
  },
  {
    name: "Bedrock",
    icon: <IconAmazonBedrock className="h-10 w-10 xl:h-10 xl:w-10 2xl:h-16 2xl:w-16" />,
    link: "https://docs.lmnr.ai/tracing/integrations/bedrock",
  },
  {
    name: "Groq",
    icon: <IconGroq className="h-10 w-10 xl:h-10 xl:w-10 2xl:h-16 2xl:w-16" />,
    link: "https://docs.lmnr.ai/tracing/integrations/groq",
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
  gridClassName = "grid grid-cols-4 md:grid-cols-5 gap-1 xl:gap-4 2xl:gap-6",
  itemClassName = "",
  showLabels = true,
  labelTextColor = "text-muted-foreground",
}: FrameworksGridProps) {

  return (
    <div className={className}>
      <div className={gridClassName}>
        {integrations.map((integration, index) => (
          <Link
            key={index}
            rel="noopener noreferrer"
            target="_blank"
            href={integration.link}
            className={`flex flex-col items-center group w-32 h-24 xl:w-32 xl:h-24 2xl:w-40 2xl:h-32 ${itemClassName}`}
          >
            <div className="w-20 h-20 xl:w-24 xl:h-24 2xl:w-28 2xl:h-28 rounded-lg flex flex-col items-center justify-center hover:bg-white/20 transition-colors">
              {integration.icon || <span className="text-4xl xl:text-5xl 2xl:text-6xl">{integration.emoji}</span>}
            </div>
            {showLabels && <span className={`text-xs xl:text-sm 2xl:text-base 2xl:mt-2 text-center ${labelTextColor}`}>{integration.name}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
