"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

import { AgentPromptBox } from "@/components/common/agent-prompt-box";
import CodeHighlighter from "@/components/ui/code-highlighter";
import Header from "@/components/ui/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { track } from "@/lib/posthog";

const DOCS_URL = "https://laminar.sh/docs/debugger/introduction";

// The prompt copied for the user to paste into a coding agent. Template literal
// so the body reads as literal multiline markdown.
const DEBUG_PROMPT = `1. Run \`npx lmnr-cli setup\` at the project root if you haven't already. This authenticates the user, links the project, saves a project API key to .env, and installs the Laminar skill.
2. Make sure the agent is instrumented with Laminar. Use the installed skill or the docs:
https://laminar.sh/docs/tracing/integrations/overview
3. Record a run in debug mode and capture the run pointer:
\`LMNR_DEBUG=true npx tsx my_agent.ts 2>&1 | tee run.log\` (or \`LMNR_DEBUG=true uv run my_agent.py ...\`), then \`grep LMNR_DEBUG_RUN run.log\` to read the \`trace_id\`.
4. Inspect the run to find the replay boundary — the LLM call right before the bug:
\`lmnr-cli sql query "SELECT span_id, name, span_type, start_time FROM spans WHERE trace_id = '<trace-id>' ORDER BY start_time"\`
5. Edit the agent, then replay from that checkpoint so cached calls return instantly and only your fix runs live:
\`LMNR_DEBUG=true LMNR_DEBUG_REPLAY_TRACE_ID=<trace-id> LMNR_DEBUG_CACHE_UNTIL=<span-id> npx tsx my_agent.ts\`
6. Repeat steps 4-5 until the run is green, then watch each attempt in the Debugger.`;

const DEBUG_RUN = {
  python: `LMNR_DEBUG=1 uv run main.py # or whatever your run command is`,
  typescript: `LMNR_DEBUG=1 npm run dev # or whatever your run command is`,
};

// Startup / onboarding page shown when a project has no debugger sessions yet,
// in place of the table. Modeled on the evaluations / traces placeholders.
export default function SessionsPlaceholder() {
  const [tab, setTab] = useState("typescript");

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <Header path="debugger sessions" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-12 p-6 pb-16">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">Get started with the Debugger</h1>
            <p className="text-sm text-muted-foreground">
              Run your instrumented agent in debug mode and its sessions show up here to capture and replay.
            </p>
          </div>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">Activate debugger with just one variable</h2>
              <p className="text-sm text-muted-foreground">
                Run your agent like normal, with just one extra environment variable to see debugger.
              </p>
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex border-none">
                <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="typescript">
                <CodeHighlighter
                  copyable
                  className="rounded-md border bg-background p-4 text-xs"
                  code={DEBUG_RUN.typescript}
                  language="bash"
                />
              </TabsContent>
              <TabsContent value="python">
                <CodeHighlighter
                  copyable
                  className="rounded-md border bg-background p-4 text-xs"
                  code={DEBUG_RUN.python}
                  language="bash"
                />
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">Debugger is built for coding agents.</h2>
              <p className="text-sm text-muted-foreground">
                Copy this prompt and let your coding agent record, inspect, and replay the runs.
              </p>
            </div>
            <AgentPromptBox
              prompt={DEBUG_PROMPT}
              copyLabel="Copy debugger prompt"
              onCopy={() => track("debugger_sessions", "debugger_prompt_copied")}
            />
          </div>

          <div className="flex items-center gap-6 text-sm">
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
            >
              Documentation
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
            <a
              href="https://discord.com/invite/nNFUUDAKub"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
            >
              Need help? Join Discord
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
