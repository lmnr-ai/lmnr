"use client";

import { useSearchParams } from "next/navigation";

import { AgentPromptBox } from "@/components/common/agent-prompt-box";
import { track } from "@/lib/posthog";

// The prompt copied for the user to run themselves or paste into a coding agent.
// Template literal so the body reads as literal multiline markdown.
const AGENT_PROMPT = `1. Run \`npx lmnr-cli setup\` at the project root to get started with Laminar. This command will authenticate the user, save a new project API key to .env, and install the Laminar skill.
2. Instrument your project with Laminar using the installed skill or the docs:
https://laminar.sh/docs/tracing/integrations/overview
3. Run your project.
4. Verify instrumentation:
\`lmnr-cli sql query "SELECT * FROM traces ORDER BY start_time DESC LIMIT 1" --json \`
5. View your traces in the browser`;

export function AgentTab() {
  const isFromOnboarding = useSearchParams().get("onboarding") === "true";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium">Get started in one prompt</h3>
          <p className="text-sm text-muted-foreground">
            Copy and paste this prompt to get started with your coding agent
          </p>
        </div>

        <AgentPromptBox
          prompt={AGENT_PROMPT}
          onCopy={() => track("onboarding", "coding_agent_command_copied", { from_onboarding: isFromOnboarding })}
        />
      </div>
    </div>
  );
}
