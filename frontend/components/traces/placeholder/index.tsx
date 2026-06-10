"use client";

import { ArrowUpRight } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { track } from "@/lib/posthog";

import Header from "../../ui/header";
import { ManualTab } from "./manual-tab";
import { OneCommandSetup } from "./one-command-setup";

export default function TracesPagePlaceholder() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const [isConnected, setIsConnected] = useState(false);
  // Below the "Listening for incoming traces" banner the page shows either the
  // one-command setup (default) or the full manual onboarding ("Set up manually").
  const [manualSetup, setManualSetup] = useState(false);
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

  const onSetupManually = () => {
    track("onboarding", "manual_setup_selected", { from_onboarding: isFromOnboarding });
    setManualSetup(true);
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Header path={"traces"} />
      <ScrollArea>
        <div className="flex flex-col mx-auto p-6 max-w-3xl gap-8 pb-16">
          <h1 className="text-2xl font-medium">Get started with Tracing</h1>
          {isConnected && (
            <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <span className="text-xs text-primary-foreground">Listening for incoming traces</span>
            </div>
          )}

          {manualSetup ? (
            <ManualTab onClose={() => setManualSetup(false)} />
          ) : (
            <OneCommandSetup onSetupManually={onSetupManually} />
          )}

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
