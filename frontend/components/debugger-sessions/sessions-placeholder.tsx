"use client";

import { ArrowUpRight } from "lucide-react";

import { AgentPromptBox } from "@/components/common/agent-prompt-box";
import Header from "@/components/ui/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { track } from "@/lib/posthog";

const DOCS_URL = "https://laminar.sh/docs/debugger/introduction";

// The prompt copied for the user to paste into a coding agent. Template literal
// so the body reads as literal multiline markdown.
const DEBUG_PROMPT = `1. Run \`npx lmnr-cli setup\` at the project root if you haven't already. This authenticates the user, links the project, saves a project API key to .env, and installs the Laminar skill.

2. Verify the Laminar skill is installed and read it. It has the full, robust debugger and instrumentation instructions, so refer to it as you work, and use it to confirm your agent is instrumented with Laminar.

3. Run the agent in debug mode by prefixing your normal run command with \`LMNR_DEBUG=1\`:
\`LMNR_DEBUG=1 npm run dev\` (or \`LMNR_DEBUG=1 uv run main.py\`, or whatever your run command is).
Running the same command again automatically associates the run with the same debugger session. Start a fresh session anytime with \`npx lmnr-cli debug session new\`.

The skill has everything below in detail. For quick reference:

- Inspect: query your runs with SQL, e.g. \`npx lmnr-cli sql query "SELECT span_id, name, span_type, start_time FROM spans WHERE trace_id = '<trace-id>' ORDER BY start_time"\`.
- Replay (caching): after editing, re-run replaying cached LLM calls up to a boundary so only your fix runs live: \`LMNR_DEBUG=1 LMNR_DEBUG_REPLAY_TRACE_ID=<trace-id> LMNR_DEBUG_CACHE_UNTIL=<span-id> npm run dev\`.
- Leave trace notes: \`npx lmnr-cli trace append-note "## What this run showed ..."\` so the human can follow what you did and why.
- Rename the session: \`npx lmnr-cli debug session set-name "Fix report length + search tool"\`.`;

// Startup / onboarding page shown when a project has no debugger sessions yet,
// in place of the table. Modeled on the evaluations / traces placeholders.
export default function SessionsPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <Header path="debugger sessions" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6 pb-16">
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-medium">Get started with Debugger</h1>
            <p className="text-muted-foreground leading-6">
              With Laminar CLI your coding agent can run your AI agent, inspect the trace of the run, modify your agent,
              and run again with cached state – fully owning the iteration loop.
            </p>
            <p className="text-muted-foreground leading-6">
              Copy the prompt below and hand it to your coding agent to get started.
            </p>
          </div>

          <AgentPromptBox
            prompt={DEBUG_PROMPT}
            copyLabel="Copy debugger prompt"
            onCopy={() => track("debugger_sessions", "debugger_prompt_copied")}
          />

          <div className="flex items-center gap-6 text-sm">
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
            >
              Debugger docs
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <a
              href="https://laminar.sh/docs/tracing/integrations/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
            >
              Make sure your agent is instrumented
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
