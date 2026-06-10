"use client";

import { useSearchParams } from "next/navigation";

import { CopyButton } from "@/components/ui/copy-button";
import { track } from "@/lib/posthog";

// The instruction the user pastes into Cursor / Claude Code / etc. Backticks are
// kept in the copied text so the agent reads `npx lmnr-cli setup` as a command.
const AGENT_PROMPT = "Run `npx lmnr-cli setup` to get started with Laminar";

export function CodingAgentCard() {
  const isFromOnboarding = useSearchParams().get("onboarding") === "true";

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-4">
      <p className="text-sm">
        Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npx lmnr-cli setup</code> to get started
        with Laminar
      </p>
      <CopyButton
        text={AGENT_PROMPT}
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground"
        onCopy={() => track("onboarding", "coding_agent_command_copied", { from_onboarding: isFromOnboarding })}
      />
    </div>
  );
}
