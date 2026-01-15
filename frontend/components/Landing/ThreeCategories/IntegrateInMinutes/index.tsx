"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import DocsButton from "../../DocsButton";
import LogoButton from "../../LogoButton";
import { bodyLarge, subsectionTitle } from "../../classNames";
import { type Integration } from "./snippets";

// Import all logos
import bedrock from "@/assets/landing/logos/bedrock.svg";
import browserUse from "@/assets/landing/logos/browser-use.svg";
import claude from "@/assets/landing/logos/claude.svg";
import crewAi from "@/assets/landing/logos/crew-ai.svg";
import gemini from "@/assets/landing/logos/gemini.svg";
import groq from "@/assets/landing/logos/groq.svg";
import langgraph from "@/assets/landing/logos/langgraph.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";
import mistral from "@/assets/landing/logos/mistral.svg";
import openAi from "@/assets/landing/logos/open-ai.svg";
import openHands from "@/assets/landing/logos/open-hands.svg";
import openTelemetry from "@/assets/landing/logos/open-telemetry.svg";
import pinecone from "@/assets/landing/logos/pinecone.svg";
import playwright from "@/assets/landing/logos/playwright.svg";
import qdrant from "@/assets/landing/logos/qdrant.svg";
import vercel from "@/assets/landing/logos/vercel.svg";
import IntegrationCodeSnippet from "./IntegrationCodeSnippet";

interface Props {
  className?: string;
}

const logos: { src: string; alt: string; name: string; integration?: Integration }[] = [
  { src: browserUse, alt: "Browser Use", name: "browser-use", integration: "browser-use" },
  { src: claude, alt: "Claude", name: "claude", integration: "claude" },
  { src: vercel, alt: "Vercel", name: "vercel", integration: "vercel" },
  { src: langgraph, alt: "LangGraph", name: "langgraph", integration: "langgraph" },
  { src: lightLlm, alt: "Light LLM", name: "light-llm", integration: "light-llm" },
  { src: gemini, alt: "Gemini", name: "gemini" },
  { src: openAi, alt: "OpenAI", name: "open-ai" },
  { src: crewAi, alt: "Crew AI", name: "crew-ai" },
  { src: groq, alt: "Groq", name: "groq" },
  { src: mistral, alt: "Mistral", name: "mistral" },
  { src: bedrock, alt: "Bedrock", name: "bedrock" },
  { src: playwright, alt: "Playwright", name: "playwright" },
  { src: openTelemetry, alt: "Open Telemetry", name: "open-telemetry" },
  { src: openHands, alt: "Open Hands", name: "open-hands" },
  { src: pinecone, alt: "Pinecone", name: "pinecone" },
  { src: qdrant, alt: "Qdrant", name: "qdrant" },
];

const IntegrateInMinutes = ({ className }: Props) => {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration>("browser-use");

  return (
    <div className={cn("flex flex-col gap-[54px] items-start w-full", className)}>
      <div className="flex flex-col gap-1 items-start w-full">
        <p className={subsectionTitle}>Integrate in minutes</p>
        <p className={bodyLarge}>Compatible with all your favorites</p>
      </div>
      {/* Logo grid */}
      <div className="flex flex-wrap gap-3 items-center w-full">
        {/* Clickable integration buttons */}
        {logos.filter(logo => logo.integration).map((logo) => (
          <LogoButton
            key={logo.name}
            logoSrc={logo.src}
            alt={logo.alt}
            isActive={logo.integration === selectedIntegration}
            onClick={() => setSelectedIntegration(logo.integration!)}
          />
        ))}
        {/* Divider */}
        <div className="px-[12px]">

        <div className="h-[40px] w-0 border-l border-landing-text-600" />
        </div>
        {/* Non-clickable logo buttons */}
        {logos.filter(logo => !logo.integration).map((logo) => (
          <LogoButton
            key={logo.name}
            logoSrc={logo.src}
            alt={logo.alt}
          />
        ))}
      </div>
      <IntegrationCodeSnippet selectedIntegration={selectedIntegration} />
      <DocsButton />
    </div>
  );
};

export default IntegrateInMinutes;
