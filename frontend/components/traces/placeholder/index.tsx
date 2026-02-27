"use client";

import { ArrowUpRight, Sparkles, Terminal } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { CopyButton } from "@/components/ui/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtime } from "@/lib/hooks/use-realtime";

import FrameworksGrid from "../../integrations/frameworks-grid";
import ApiKeyGenerator from "../../onboarding/api-key-generator";
import Header from "../../ui/header";
import { LAMINAR_BASIC_INSTALL_PROMPT, LAMINAR_INSTRUMENTATION_PROMPT, LAMINAR_MIGRATION_PROMPT } from "./prompts";

const InstallTabsSection = dynamic(() => import("./tabs-section").then((mod) => mod.InstallTabsSection), {
  ssr: false,
});

const InitializationTabsSection = dynamic(() => import("./tabs-section").then((mod) => mod.InitializationTabsSection), {
  ssr: false,
});

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
    title: "Instrument an existing product",
    subtitle: "Existing LLM/agent pipelines",
    prompt: LAMINAR_INSTRUMENTATION_PROMPT,
  },
  {
    title: "Basic install + auto-instrumentation",
    subtitle: "Minimal code changes",
    prompt: LAMINAR_BASIC_INSTALL_PROMPT,
  },
  {
    title: "Migrate from another platform",
    subtitle: "Langfuse, LangSmith, Helicone, etc.",
    prompt: LAMINAR_MIGRATION_PROMPT,
  },
];

function PromptCard({ title, subtitle, prompt }: { title: string; subtitle: string; prompt: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="group flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 transition-colors hover:bg-muted/30">
        <span className="text-sm flex-1">{title}</span>
        <span className="text-xs text-muted-foreground hidden sm:block">{subtitle}</span>
        <CopyButton text={prompt} variant="ghost" size="icon" className="shrink-0 text-muted-foreground" />
      </div>
      {expanded && (
        <div className="max-h-64 overflow-auto rounded-b-md border border-t-0 bg-background p-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">{prompt}</pre>
        </div>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer mt-1 px-1"
      >
        {expanded ? "Hide prompt" : "View prompt"}
      </button>
    </div>
  );
}

function AutomaticTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Skills</h3>
        <div className="rounded-lg border divide-y overflow-hidden">
          {SKILLS_COMMANDS.map((item) => (
            <div
              key={item.command}
              className="group flex items-center gap-3 bg-background px-4 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <span className="text-xs text-muted-foreground w-40 shrink-0">{item.label}</span>
              <code className="text-sm font-mono flex-1 min-w-0">{item.command}</code>
              <CopyButton
                text={item.command}
                variant="ghost"
                size="icon"
                className="shrink-0 invisible group-hover:visible text-muted-foreground"
              />
            </div>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Browse more at{" "}
          <a
            href="https://skills.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            skills.sh
          </a>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Prompts</h3>
        <p className="text-xs text-muted-foreground">Copy and paste into your coding agent.</p>
        <div className="flex flex-col gap-2">
          {PROMPT_CARDS.map((card) => (
            <PromptCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ManualTab() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Install Laminar SDK</h3>
        <InstallTabsSection />
      </div>

      <ApiKeyGenerator context="traces" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Integrations</h3>
          <p className="text-xs text-muted-foreground">
            Learn how to integrate Laminar with your favorite frameworks and SDKs.
          </p>
        </div>
        <FrameworksGrid gridClassName="grid grid-cols-7 gap-4" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Initialize Laminar</h3>
          <p className="text-xs text-muted-foreground">Add 2 lines of code at the top of your project.</p>
        </div>
        <InitializationTabsSection />
      </div>
    </div>
  );
}

export default function TracesPagePlaceholder() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const [isConnected, setIsConnected] = useState(false);

  const eventHandlers = useMemo(
    () => ({
      trace_update: () => {
        localStorage.setItem("traces-table:realtime", JSON.stringify(true));
        router.refresh();
      },
    }),
    [router]
  );

  const onConnectionUpdate = useCallback(
    (status: boolean) => () => {
      setIsConnected(status);
    },
    []
  );

  useRealtime({
    key: "traces",
    projectId: params.projectId,
    enabled: true,
    onConnect: onConnectionUpdate(true),
    onError: onConnectionUpdate(false),
    eventHandlers,
  });

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Header path={"traces"} />
      <ScrollArea>
        <div className="flex flex-col mx-auto p-6 max-w-3xl gap-8 pb-16">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Get started with Tracing</h1>
              <p className="text-sm text-muted-foreground">
                You don{"'"}t have any traces yet. Choose how you{"'"}d like to set up.
              </p>
            </div>
            {isConnected && (
              <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                <span className="text-sm">Listening for incoming traces&hellip;</span>
              </div>
            )}
          </div>

          <Tabs defaultValue="automatic" className="gap-4">
            <TabsList className="border-none">
              <TabsTrigger value="automatic" className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Set up with AI
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                Manual
              </TabsTrigger>
            </TabsList>
            <TabsContent value="automatic">
              <AutomaticTab />
            </TabsContent>
            <TabsContent value="manual">
              <ManualTab />
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-6 text-sm">
            <a
              href="https://docs.lmnr.ai/tracing/introduction"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
            >
              Documentation
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://discord.com/invite/nNFUUDAKub"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
            >
              Need help? Join Discord
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
