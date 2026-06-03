"use client";

import { ArrowUpRight } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter";
import Header from "@/components/ui/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PYTHON_INSTALL, TYPESCRIPT_INSTALL } from "@/lib/const";
import { useToast } from "@/lib/hooks/use-toast";

// TODO: replace with the real "run your agent in debug mode" prompt when ready.
const DEBUG_PROMPT = "TODO: debug-mode prompt — pending copy.";
// TODO: replace with the real debugger docs URL when ready.
const DOCS_URL = "#";

const DEBUG_RUN = {
  python: `LMNR_DEBUG=true uv run my_agent.py`,
  typescript: `LMNR_DEBUG=true npx tsx my_agent.ts`,
};

// Startup / onboarding page shown when a project has no debugger sessions yet,
// in place of the table. Modeled on the evaluations / traces placeholders.
export default function SessionsPlaceholder() {
  const { toast } = useToast();
  const [tab, setTab] = useState("typescript");

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DEBUG_PROMPT);
      toast({ title: "Copied prompt", duration: 1500 });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy — clipboard unavailable" });
    }
  }, [toast]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <Header path="debugger sessions" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6 pb-16">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Get started with the debugger</h1>
            <p className="text-sm text-muted-foreground">
              You don{"'"}t have any debugger sessions yet. Run your instrumented agent in debug mode and its sessions
              show up here to capture and replay.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Install Laminar SDK</h2>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex border-none">
                <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="typescript">
                <CodeHighlighter
                  copyable
                  className="rounded-md border bg-background p-4 text-xs"
                  code={TYPESCRIPT_INSTALL}
                  language="bash"
                />
              </TabsContent>
              <TabsContent value="python">
                <CodeHighlighter
                  copyable
                  className="rounded-md border bg-background p-4 text-xs"
                  code={PYTHON_INSTALL}
                  language="bash"
                />
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Run your agent in debug mode</h2>
            <p className="text-sm text-muted-foreground">
              Debug mode is built for coding agents. Copy the prompt and let your agent drive the runs.
            </p>
            <div className="flex items-center gap-2">
              <Button size="md" onClick={handleCopyPrompt}>
                Copy prompt
              </Button>
              {/* TODO: point at the real docs page when ready. */}
              <Button size="md" variant="outline" asChild>
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                  Docs
                </a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Or run it yourself:</p>
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

          <div className="flex items-center gap-6 text-sm">
            {/* TODO: point at the real debugger docs page when ready. */}
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground underline transition-colors hover:text-primary"
            >
              Documentation
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <a
              href="https://discord.com/invite/nNFUUDAKub"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground underline transition-colors hover:text-primary"
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
