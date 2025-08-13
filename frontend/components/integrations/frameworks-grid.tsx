"use client";

import Link from "next/link";
import { ReactNode } from "react";

import {
  IconAmazonBedrock,
  IconAnthropic,
  IconBrowserUse,
  IconCrewAI,
  IconGemini,
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
    icon: <IconOpenTelemetry className="h-6 w-6" />,
    link: "https://docs.lmnr.ai/tracing/integrations/opentelemetry",
  },
  {
    name: "LangGraph",
    icon: <IconLangchain className="h-8 w-8" />,
    link: "https://docs.lmnr.ai/tracing/integrations/langchain",
  },
  {
    name: "CrewAI",
    icon: <IconCrewAI className="w-6 h-6 text-white" />,
    link: "https://docs.lmnr.ai/tracing/integrations/crewai",
  },
  {
    name: "AI SDK",
    icon: <IconVercel className="w-4 h-4 text-white" />,
    link: "https://docs.lmnr.ai/tracing/integrations/vercel-ai-sdk",
  },
  {
    name: "LiteLLM",
    emoji: "🚅",
    link: "https://docs.lmnr.ai/tracing/integrations/litellm",
  },
  {
    name: "Browser Use",
    icon: <IconBrowserUse className="w-5 h-5 text-white" />,
    link: "https://docs.lmnr.ai/tracing/integrations/browser-use",
  },
  {
    name: "StageHand",
    emoji: "🤘",
    link: "https://docs.lmnr.ai/tracing/integrations/stagehand",
  },
  {
    name: "Playwright",
    icon: <IconPlaywright className="w-6 h-6 text-white" />,
    link: "https://docs.lmnr.ai/tracing/integrations/playwright",
  },
  {
    name: "OpenAI",
    icon: <IconOpenAI className="w-6 h-6 text-white" />,
    link: "https://docs.lmnr.ai/tracing/integrations/openai",
  },
  {
    name: "Anthropic",
    icon: <IconAnthropic className="w-6 h-6 text-white" />,
    link: "https://docs.lmnr.ai/tracing/integrations/anthropic",
  },
  {
    name: "Gemini",
    icon: <IconGemini className="w-6 h-6 text-white" />,
    link: "https://docs.lmnr.ai/tracing/integrations/gemini",
  },
  {
    name: "Mistral",
    icon: <IconMistral className="w-6 h-6 text-white" />,
    link: "https://docs.lmnr.ai/tracing/integrations/mistral",
  },
  {
    name: "Bedrock",
    icon: <IconAmazonBedrock className="w-6 h-6 text-white" />,
    link: "https://docs.lmnr.ai/tracing/integrations/bedrock",
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
        {integrations.map((integration, index) => (
          <Link
            key={index}
            rel="noopener noreferrer"
            target="_blank"
            href={integration.link}
            className={`flex flex-col items-center group ${itemClassName}`}
          >
            <div className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors">
              {integration.icon || <span className="text-2xl">{integration.emoji}</span>}
            </div>
            {showLabels && <span className={`text-xs mt-2 text-center ${labelTextColor}`}>{integration.name}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
