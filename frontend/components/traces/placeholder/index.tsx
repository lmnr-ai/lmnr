"use client";

import { ArrowUpRight, Sparkles, Terminal } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtime } from "@/lib/hooks/use-realtime";

import Header from "../../ui/header";
import { AutomaticTab } from "./automatic-tab";
import { ManualTab } from "./manual-tab";

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

          <Tabs defaultValue="manual" className="gap-7">
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
