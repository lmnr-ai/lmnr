"use client";

import { Terminal } from "lucide-react";

import { CopyButton } from "@/components/ui/copy-button";
import { track } from "@/lib/posthog";

import ApiKeyGenerator from "../../onboarding/api-key-generator";
import { PromptCard } from "./prompt-card";
import { LAMINAR_INSTALL_FROM_SCRATCH, LAMINAR_MIGRATION_PROMPT } from "./prompts";

type SkillId = "quickstart-trace" | "instrument-codebase" | "migrate-observability";
type PromptId = "install_from_scratch" | "migration";

const SKILLS_COMMANDS: { id: SkillId; label: string; command: string }[] = [
  {
    id: "quickstart-trace",
    label: "Quick demo trace",
    command: "npx skills add lmnr-ai/laminar-skills --skill laminar-quickstart-trace",
  },
  {
    id: "instrument-codebase",
    label: "Instrument a real codebase",
    command: "npx skills add lmnr-ai/laminar-skills --skill laminar-instrument-codebase",
  },
  {
    id: "migrate-observability",
    label: "Migrate from another tool",
    command: "npx skills add lmnr-ai/laminar-skills --skill laminar-migrate-observability",
  },
];

const PROMPT_CARDS: { id: PromptId; title: string; subtitle: string; prompt: string }[] = [
  {
    id: "install_from_scratch",
    title: "Install and instrument from scratch",
    subtitle: "Best for new projects or repos without existing observability.",
    prompt: LAMINAR_INSTALL_FROM_SCRATCH,
  },
  {
    id: "migration",
    title: "Migrate from another observability platform",
    subtitle: "Best if you already use Langfuse, LangSmith, Helicone, or custom OpenTelemetry.",
    prompt: LAMINAR_MIGRATION_PROMPT,
  },
];

interface AutomaticTabProps {
  isFromOnboarding: boolean;
}

export function AutomaticTab({ isFromOnboarding }: AutomaticTabProps) {
  return (
    <div className="flex flex-col gap-8">
      <ApiKeyGenerator
        context="traces"
        title="1. Paste an API key into your .env"
        titleClassName="text-base"
        subtitle=""
      />

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-medium">2. Paste and run a prompt</h3>
        <div className="flex flex-col gap-2">
          {PROMPT_CARDS.map((card) => (
            <PromptCard
              key={card.id}
              title={card.title}
              subtitle={card.subtitle}
              prompt={card.prompt}
              onCopy={() =>
                track("onboarding", "prompt_copied", { prompt: card.id, from_onboarding: isFromOnboarding })
              }
              onExpandedChange={(expanded) =>
                track("onboarding", "prompt_expanded", {
                  prompt: card.id,
                  expanded,
                  from_onboarding: isFromOnboarding,
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-medium">3. Or install and run a skill</h3>
        <div className="flex flex-col gap-2">
          {SKILLS_COMMANDS.map((item) => (
            <div key={item.command} className="rounded-lg border bg-background p-4">
              <span className="text-sm font-medium text-primary">{item.label}</span>
              <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                <Terminal className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                <code className="text-sm font-mono flex-1 min-w-0 truncate">{item.command}</code>
                <CopyButton
                  text={item.command}
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground"
                  onCopy={() =>
                    track("onboarding", "skill_copied", { skill: item.id, from_onboarding: isFromOnboarding })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
