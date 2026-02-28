"use client";

import { Terminal } from "lucide-react";

import { CopyButton } from "@/components/ui/copy-button";

import ApiKeyGenerator from "../../onboarding/api-key-generator";
import { LAMINAR_INSTALL_FROM_SCRATCH, LAMINAR_MIGRATION_PROMPT } from "./prompts";
import { PromptCard } from "./prompt-card";

const SKILLS_COMMANDS = [
  {
    label: "Quick demo trace",
    command: "npx skills add lmnr-ai/laminar-skills --skill laminar-quickstart-trace",
  },
  {
    label: "Instrument a real codebase",
    command: "npx skills add lmnr-ai/laminar-skills --skill laminar-instrument-codebase",
  },
  {
    label: "Migrate from another tool",
    command: "npx skills add lmnr-ai/laminar-skills --skill laminar-migrate-observability",
  },
];

const PROMPT_CARDS = [
  {
    title: "Install and instrument from scratch",
    subtitle: "Best for new projects or repos without existing observability.",
    prompt: LAMINAR_INSTALL_FROM_SCRATCH,
  },
  {
    title: "Migrate from another observability platform",
    subtitle: "Best if you already use Langfuse, LangSmith, Helicone, or custom OpenTelemetry.",
    prompt: LAMINAR_MIGRATION_PROMPT,
  },
];

export function AutomaticTab() {
  return (
    <div className="flex flex-col gap-8">
      <ApiKeyGenerator context="traces" title="1. Paste an API key into your .env" subtitle="" />

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-medium">2. Paste and run a prompt</h3>
        <div className="flex flex-col gap-2">
          {PROMPT_CARDS.map((card) => (
            <PromptCard key={card.title} {...card} />
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
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
