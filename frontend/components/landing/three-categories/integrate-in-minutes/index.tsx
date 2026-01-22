"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Import all logos
import bedrock from "@/assets/landing/logos/bedrock.svg";
import browserUse from "@/assets/landing/logos/browser-use.svg";
import claude from "@/assets/landing/logos/claude.svg";
import gemini from "@/assets/landing/logos/gemini.svg";
import groq from "@/assets/landing/logos/groq.svg";
import langchain from "@/assets/landing/logos/langchain.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";
import mistral from "@/assets/landing/logos/mistral.svg";
import openAi from "@/assets/landing/logos/open-ai.svg";
import openHands from "@/assets/landing/logos/open-hands.svg";
import openTelemetry from "@/assets/landing/logos/open-telemetry.svg";
import playwright from "@/assets/landing/logos/playwright.svg";
import vercel from "@/assets/landing/logos/vercel.svg";
import { cn } from "@/lib/utils";

import { bodyLarge, subsectionTitle } from "../../class-names";
import DocsButton from "../../docs-button";
import LogoButton from "../../logo-button";
import IntegrationCodeSnippet from "./integration-code-snippet";
import { type Integration } from "./snippets";

interface Props {
  className?: string;
}

const logos: { src: string; alt: string; name: string; integration?: Integration; docsUrl?: string }[] = [
  { src: browserUse, alt: "Browser Use", name: "browser-use", integration: "browser-use" },
  { src: claude, alt: "Claude", name: "claude", integration: "claude" },
  { src: vercel, alt: "Vercel", name: "vercel", integration: "vercel" },
  { src: openHands, alt: "OpenHands", name: "open-hands", integration: "open-hands" },
  { src: langchain, alt: "LangChain", name: "langchain", integration: "langchain" },
  { src: lightLlm, alt: "Light LLM", name: "light-llm", integration: "light-llm" },
  { src: gemini, alt: "Gemini", name: "gemini", docsUrl: "https://docs.laminar.sh/tracing/integrations/gemini" },
  { src: openAi, alt: "OpenAI", name: "open-ai", docsUrl: "https://docs.laminar.sh/tracing/integrations/openai" },
  { src: groq, alt: "Groq", name: "groq", docsUrl: "https://docs.laminar.sh/tracing/integrations/overview" },
  { src: mistral, alt: "Mistral", name: "mistral", docsUrl: "https://docs.laminar.sh/tracing/integrations/overview" },
  { src: bedrock, alt: "Bedrock", name: "bedrock", docsUrl: "https://docs.laminar.sh/tracing/integrations/overview" },
  {
    src: playwright,
    alt: "Playwright",
    name: "playwright",
    docsUrl: "https://docs.laminar.sh/tracing/integrations/playwright",
  },
  {
    src: openTelemetry,
    alt: "Open Telemetry",
    name: "open-telemetry",
    docsUrl: "https://docs.laminar.sh/tracing/otel",
  },
];

const ROTATE_INTERVAL = 5000;
const CLICK_INTERVAL = 10000;

const integrations = logos.filter((logo) => logo.integration).map((logo) => logo.integration!);

const IntegrateInMinutes = ({ className }: Props) => {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration>("browser-use");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startInterval = useCallback((interval: number = ROTATE_INTERVAL) => {
    intervalRef.current = setInterval(() => {
      setSelectedIntegration((current) => {
        const currentIndex = integrations.indexOf(current);
        const nextIndex = (currentIndex + 1) % integrations.length;
        return integrations[nextIndex];
      });
    }, interval);
  }, []);

  const handleSelectIntegration = useCallback(
    (integration: Integration) => {
      setSelectedIntegration(integration);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      startInterval(CLICK_INTERVAL);
    },
    [startInterval]
  );

  useEffect(() => {
    startInterval();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startInterval]);

  return (
    <div className={cn("flex flex-col md:gap-[54px] items-start w-full", "gap-8", className)}>
      <div className="flex flex-col gap-1 items-start w-full">
        <p className={subsectionTitle}>Start tracing your agent in minutes</p>
        <p className={bodyLarge}>Two lines to integrate with the AI frameworks or SDKs you use</p>
      </div>
      {/* Logo grid */}
      <div className={cn("flex flex-wrap md:gap-3 items-center w-full", "gap-2")}>
        {/* Clickable integration buttons */}
        {logos
          .filter((logo) => logo.integration)
          .map((logo) => (
            <LogoButton
              key={logo.name}
              logoSrc={logo.src}
              alt={logo.alt}
              isActive={logo.integration === selectedIntegration}
              onClick={() => handleSelectIntegration(logo.integration!)}
            />
          ))}
        {/* Divider */}
        <div className={cn("md:px-[12px]", "px-[8px]")}>
          <div className={cn("md:h-[40px] w-0 border-l border-landing-text-600", "h-[32px]")} />
        </div>
        {/* Logo buttons that link to docs */}
        {logos
          .filter((logo) => !logo.integration)
          .map((logo) => (
            <LogoButton key={logo.name} logoSrc={logo.src} alt={logo.alt} href={logo.docsUrl} />
          ))}
      </div>
      <IntegrationCodeSnippet selectedIntegration={selectedIntegration} integrationOrder={integrations} />
      <DocsButton href="https://docs.laminar.sh/tracing/integrations/overview" />
    </div>
  );
};

export default IntegrateInMinutes;
