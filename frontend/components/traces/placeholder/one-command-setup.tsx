"use client";

import { Check } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";

// The prompt copied for the user to run themselves or paste into a coding agent.
// Backticks are kept so the agent reads `npx lmnr-cli setup` as a command.
const AGENT_PROMPT = "Run `npx lmnr-cli setup` at the project root to get started with Laminar.";

interface Props {
  onSetupManually: () => void;
}

export function OneCommandSetup({ onSetupManually }: Props) {
  const isFromOnboarding = useSearchParams().get("onboarding") === "true";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
      track("onboarding", "coding_agent_command_copied", { from_onboarding: isFromOnboarding });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently no-op.
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium">Copy and paste into your coding agent</h3>
        <p className="text-xs text-secondary-foreground">
          This command creates an API key, installs the Laminar skill, instruments your repo, and sends traces to this
          project
        </p>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="relative flex items-center justify-center gap-2.5 rounded-md border bg-secondary px-10 py-14 text-base text-secondary-foreground group hover:border-secondary-foreground/25 active:border-secondary-foreground/35 active:bg-muted/50"
      >
        <span>Run</span>
        <code className="rounded bg-muted px-3 font-mono">npx lmnr-cli setup</code>
        <span>in your project directory</span>
        <div
          aria-label={copied ? "Copied" : "Copy prompt"}
          className={cn(
            "absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
            { "bg-primary/20": copied }
          )}
        >
          {copied && <Check className="h-3 w-3 text-primary" />}
          {copied ? (
            <span className="text-primary">Copied</span>
          ) : (
            <>
              <span className="hidden group-hover:block text-secondary-foreground">Click to copy</span>
              <span className="block group-hover:hidden">Copy prompt</span>
            </>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={onSetupManually}
        className="self-start text-xs text-secondary-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        Set up manually instead
      </button>
    </div>
  );
}
