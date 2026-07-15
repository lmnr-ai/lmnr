"use client";

import { useSearchParams } from "next/navigation";

import { AgentPromptBox } from "@/components/common/agent-prompt-box";
import { track } from "@/lib/posthog";

// The prompt copied for the user to run themselves or paste into a coding agent.
// Template literal so the body reads as literal multiline markdown.
const AGENT_PROMPT = `1. Run \`npx lmnr-cli setup\` at the project root to get started with Laminar. This command will authenticate the user, save a new project API key to .env, and install the Laminar skill.
2. Write an evaluation for the part of my app I want to measure. Use the installed skill or the docs:
https://laminar.sh/docs/evaluations/introduction
An evaluation has three parts:
   - \`data\`: a list of inputs, each with an optional \`target\` (the expected output).
   - \`executor\`: a function that runs my app on each input and returns its output.
   - \`evaluators\`: functions that score each output (e.g. compare against \`target\`).
3. Run the evaluation:
\`npx lmnr eval\`  (TypeScript)  or  \`lmnr eval\`  (Python)
4. Direct the user to view the evaluation scores and per-datapoint traces in the browser.`;

export function AgentTab() {
  const isFromOnboarding = useSearchParams().get("onboarding") === "true";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium">Get started in one prompt</h3>
        <p className="text-sm text-muted-foreground">
          Copy and paste this prompt to get started with your coding agent
        </p>
      </div>

      <AgentPromptBox
        prompt={AGENT_PROMPT}
        onCopy={() => track("onboarding", "evals_coding_agent_command_copied", { from_onboarding: isFromOnboarding })}
      />
    </div>
  );
}
