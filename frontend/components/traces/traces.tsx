"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { Resizable } from "re-resizable";
import { useEffect, useMemo, useState } from "react";

import TraceViewNavigationProvider, { getTraceConfig } from "@/components/traces/trace-view/navigation-context";
import { filterColumns } from "@/components/traces/trace-view/utils";
import { useUserContext } from "@/contexts/user-context";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

import FiltersContextProvider from "../ui/datatable-filter/context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import SessionsTable from "./sessions-table";
import SpansTable from "./spans-table";
import TraceView from "./trace-view";
import TracesTable from "./traces-table";

enum SelectedTab {
  TRACES = "traces",
  SESSIONS = "sessions",
  SPANS = "spans",
}

export default function Traces() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { email } = useUserContext();
  const posthog = usePostHog();
  const selectedView = searchParams.get("view") ?? SelectedTab.TRACES;

  const resetUrlParams = (newView: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete("filter");
    params.delete("textSearch");
    params.delete("traceId");
    params.delete("spanId");
    params.set("view", newView);
    setIsSidePanelOpen(false);
    setTraceId(null);
    router.push(`${pathName}?${params.toString()}`);
  };

  if (isFeatureEnabled(Feature.POSTHOG)) {
    posthog.identify(email);
  }

  const [traceId, setTraceId] = useState<string | null>(searchParams.get("traceId") ?? null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(traceId != null);

  const traceViewWidth = useMemo(() => {
    if (typeof window !== "undefined") {
      const viewportWidth = window.innerWidth;
      const seventyFivePercent = viewportWidth * 0.75;
      return Math.min(seventyFivePercent, 1100);
    }
    return 1000;
  }, []);

  useEffect(() => {
    setIsSidePanelOpen(traceId != null);
  }, [traceId]);

  return (
    <TraceViewNavigationProvider config={getTraceConfig()} onNavigate={setTraceId}>
      <div className="flex flex-col flex-1">
        <Tabs
          value={selectedView}
          className="flex flex-col h-full w-full"
          onValueChange={(value) => resetUrlParams(value)}
        >
          <TabsList className="w-full flex px-4 border-b text-sm">
            <TabsTrigger value="traces">Traces</TabsTrigger>
            <TabsTrigger value="spans">Spans</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          </TabsList>
          <TabsContent value="traces" asChild>
            <TracesTable traceId={traceId} onRowClick={setTraceId} />
          </TabsContent>
          <TabsContent value="sessions" asChild>
            <SessionsTable onRowClick={setTraceId} />
          </TabsContent>
          <TabsContent value="spans" asChild>
            <SpansTable onRowClick={setTraceId} />
          </TabsContent>
        </Tabs>
        {isSidePanelOpen && (
          <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
            <Resizable
              enable={{
                left: true,
              }}
              defaultSize={{
                width: traceViewWidth,
              }}
            >
              <FiltersContextProvider columns={filterColumns}>
                <TraceView
                  key={traceId}
                  onClose={() => {
                    const params = new URLSearchParams(searchParams);
                    params.delete("traceId");
                    params.delete("spanId");
                    router.push(`${pathName}?${params.toString()}`);
                    setIsSidePanelOpen(false);
                    setTraceId(null);
                  }}
                  traceId={traceId!}
                />
              </FiltersContextProvider>
            </Resizable>
          </div>
        )}
      </div>
    </TraceViewNavigationProvider>
  );
}
