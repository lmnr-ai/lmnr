"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { track } from "@/lib/posthog";

import Header from "../../ui/header";
import { AgentTab } from "./agent-tab";
import { ManualTab } from "./manual-tab";

export default function EvalsPagePlaceholder() {
  useEffect(() => {
    track("onboarding", "evals_placeholder_viewed");
  }, []);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Header path="evaluations" />
      <ScrollArea>
        <div className="flex flex-col mx-auto p-6 max-w-3xl gap-8 pb-36">
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-medium">Get started with Evaluations</h1>
            <p className="text-muted-foreground leading-6">
              Measure your agent{"'"}s performance with evaluations. Check regressions and iterate with confidence.
            </p>
            <p className="text-muted-foreground leading-6">
              You define the inputs, the function that produces the output, and a function to score it. Laminar runs
              them in parallel, traces every call, and tracks scores across runs.
            </p>
          </div>

          <Tabs defaultValue="agent" className="gap-8">
            <TabsList>
              <TabsTrigger value="agent">Coding agent</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>
            <TabsContent asChild value="agent">
              <AgentTab />
            </TabsContent>
            <TabsContent asChild value="manual">
              <ManualTab />
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-6 text-sm mt-12">
            <a
              href="https://laminar.sh/docs/evaluations/introduction"
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
