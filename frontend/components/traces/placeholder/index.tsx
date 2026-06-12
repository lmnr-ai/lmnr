"use client";

import { ArrowUpRight } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import FrameworksGrid from "@/components/integrations/frameworks-grid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { track } from "@/lib/posthog";

import Header from "../../ui/header";
import { AgentTab } from "./agent-tab";
import { ManualTab } from "./manual-tab";

export default function TracesPagePlaceholder() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const [isConnected, setIsConnected] = useState(false);
  const isFromOnboarding = searchParams.get("onboarding") === "true";

  useEffect(() => {
    track("onboarding", "traces_placeholder_viewed", { from_onboarding: isFromOnboarding });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventHandlers = useMemo(
    () => ({
      trace_update: () => {
        track("onboarding", "first_trace_received", { from_onboarding: isFromOnboarding });
        localStorage.setItem("traces-table:realtime", JSON.stringify(true));
        router.refresh();
      },
    }),
    [router, isFromOnboarding]
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
        <div className="flex flex-col mx-auto p-6 max-w-3xl gap-8 pb-36">
          <h1 className="text-2xl font-medium">Get started with Tracing</h1>
          {isConnected && (
            <div className="flex items-center gap-4 rounded-md border border-primary/30 bg-primary/5 px-5 py-4">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <span className="text-xs text-primary-foreground">Listening for incoming traces</span>
            </div>
          )}

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-medium">Works with your stack</h3>
              <p className="text-sm text-muted-foreground">Laminar integrates with the frameworks and SDKs you use</p>
            </div>
            <FrameworksGrid />
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
