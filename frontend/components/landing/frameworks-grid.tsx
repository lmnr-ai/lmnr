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
    icon: <IconOpenTelemetry className="h-10 w-10" />,
    link: "https://docs.lmnr.ai/tracing/integrations/opentelemetry",
  },
  {
    name: "LangGraph",
    icon: <IconLangchain className="h-12 w-12" />,
    link: "https://docs.lmnr.ai/tracing/integrations/langchain",
  },
  {
    name: "CrewAI",
    icon: <IconCrewAI className="h-10 w-10" />,
    link: "https://docs.lmnr.ai/tracing/integrations/crewai",
  },
  {
    name: "AI SDK",
    icon: <IconVercel className="h-8 w-8" />,
    link: "https://docs.lmnr.ai/tracing/integrations/vercel-ai-sdk",
  },
  {
    name: "LiteLLM",
    emoji: "🚅",
    link: "https://docs.lmnr.ai/tracing/integrations/litellm",
  },
  {
    name: "Browser Use",
    icon: <IconBrowserUse className="h-9 w-9" />,
    link: "https://docs.lmnr.ai/tracing/integrations/browser-use",
  },
  {
    name: "StageHand",
    emoji: "🤘",
    link: "https://docs.lmnr.ai/tracing/integrations/stagehand",
  },
  {
    name: "Playwright",
    icon: <IconPlaywright className="h-10 w-10" />,
    link: "https://docs.lmnr.ai/tracing/integrations/playwright",
  },
  {
    name: "OpenAI",
    icon: <IconOpenAI className="h-10 w-10" />,
    link: "https://docs.lmnr.ai/tracing/integrations/openai",
  },
  {
    name: "Anthropic",
    icon: <IconAnthropic className="h-10 w-10" />,
    link: "https://docs.lmnr.ai/tracing/integrations/anthropic",
  },
  {
    name: "Gemini",
    icon: <IconGemini className="h-10 w-10" />,
    link: "https://docs.lmnr.ai/tracing/integrations/gemini",
  },
  {
    name: "Mistral",
    icon: <IconMistral className="h-10 w-10" />,
    link: "https://docs.lmnr.ai/tracing/integrations/mistral",
  },
  {
    name: "Bedrock",
    icon: <IconAmazonBedrock className="h-10 w-10" />,
    link: "https://docs.lmnr.ai/tracing/integrations/bedrock",
  },
  {
    name: "Groq",
    icon: <IconGroq className="h-10 w-10" />,
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
  gridClassName = "grid grid-cols-4 md:grid-cols-5 gap-16",
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
            className={`flex flex-col items-center group w-32 h-24 ${itemClassName}`}
          >
            <div className="w-20 h-20 rounded-lg flex flex-col items-center justify-center hover:bg-white/20 transition-colors">
              {integration.icon || <span className="text-4xl">{integration.emoji}</span>}
            </div>
            {showLabels && <span className={`text-xs mt-2 text-center ${labelTextColor}`}>{integration.name}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
