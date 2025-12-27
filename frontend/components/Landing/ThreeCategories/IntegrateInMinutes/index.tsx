import { cn } from "@/lib/utils";
import DocsButton from "../../DocsButton";
import LogoButton from "../../LogoButton";
import { bodyLarge, subsectionTitle } from "../../classNames";

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

const logos = [
  { src: claude, alt: "Claude", name: "claude" },
  { src: gemini, alt: "Gemini", name: "gemini" },
  { src: openAi, alt: "OpenAI", name: "open-ai" },
  { src: langgraph, alt: "LangGraph", name: "langgraph" },
  { src: crewAi, alt: "Crew AI", name: "crew-ai" },
  { src: vercel, alt: "Vercel", name: "vercel" },
  { src: lightLlm, alt: "Light LLM", name: "light-llm" },
  { src: groq, alt: "Groq", name: "groq" },
  { src: mistral, alt: "Mistral", name: "mistral" },
  { src: bedrock, alt: "Bedrock", name: "bedrock" },
  { src: playwright, alt: "Playwright", name: "playwright" },
  { src: openTelemetry, alt: "Open Telemetry", name: "open-telemetry" },
  { src: openHands, alt: "Open Hands", name: "open-hands" },
  { src: browserUse, alt: "Browser Use", name: "browser-use" },
  { src: pinecone, alt: "Pinecone", name: "pinecone" },
  { src: qdrant, alt: "Qdrant", name: "qdrant" },
];

const IntegrateInMinutes = ({ className }: Props) => {
  return (
    <div className={cn("flex flex-col gap-[54px] items-start w-full", className)}>
      <div className="flex flex-col gap-1 items-start w-full">
        <p className={subsectionTitle}>Integrate in minutes</p>
        <p className={bodyLarge}>Compatible with all your favorites</p>
      </div>
      {/* Logo grid */}
      <div className="flex flex-wrap gap-3 items-start w-full">
        {logos.map((logo) => (
          <LogoButton key={logo.name} logoSrc={logo.src} alt={logo.alt} />
        ))}
      </div>
      <IntegrationCodeSnippet />
      <DocsButton />
    </div>
  );
};

export default IntegrateInMinutes;
