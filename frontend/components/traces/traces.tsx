"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import TraceViewNavigationProvider, { getTracesConfig } from "@/components/traces/trace-view/navigation-context";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import SessionsTable from "./sessions-table";
import SpansTable from "./spans-table";
import { TraceViewSidePanel } from "./trace-view";
import { TracesStoreProvider, useTracesStoreContext } from "./traces-store";
import TracesTable from "./traces-table";

enum TracesTab {
  TRACES = "traces",
  SESSIONS = "sessions",
  SPANS = "spans",
}

type NavigationItem =
  | string
  | {
      traceId: string;
      spanId: string;
    };

function TracesContent() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const tracesTab = (searchParams.get("view") || TracesTab.TRACES) as TracesTab;

  const { traceId, spanId, showChatInitial, setTraceId, setSpanId } = useTracesStoreContext((state) => ({
    spanId: state.spanId,
    traceId: state.traceId,
    showChatInitial: state.showChatInitial,
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
  }));

  const resetUrlParams = (newView: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete("filter");
    params.delete("textSearch");
    params.delete("traceId");
    params.delete("spanId");
    params.set("view", newView);
    setTraceId(null);
    router.push(`${pathName}?${params.toString()}`);
  };

  const handleNavigate = useCallback(
    (item: NavigationItem | null) => {
      if (item) {
        if (typeof item === "string") {
          setSpanId(null);
          setTraceId(item);
        } else {
          setSpanId(item.spanId);
          setTraceId(item.traceId);
        }
      }
    },
    [setSpanId, setTraceId]
  );

  return (
    <TraceViewNavigationProvider<NavigationItem> config={getTracesConfig()} onNavigate={handleNavigate}>
      <Tabs
        className="flex flex-1 overflow-hidden gap-4"
        value={tracesTab}
        onValueChange={(value) => resetUrlParams(value)}
      >
        <TabsList className="mx-4 h-8">
          <TabsTrigger className="text-xs" value="traces">
            Traces
          </TabsTrigger>
          <TabsTrigger className="text-xs" value="spans">
            Spans
          </TabsTrigger>
          <TabsTrigger className="text-xs" value="sessions">
            Sessions
          </TabsTrigger>
        </TabsList>
        <TabsContent value="traces" asChild>
          <TracesTable />
        </TabsContent>
        <TabsContent value="spans" asChild>
          <SpansTable />
        </TabsContent>
        <TabsContent value="sessions" asChild>
          <SessionsTable />
        </TabsContent>
      </Tabs>
      {traceId && (
        <TraceViewSidePanel
          spanId={spanId || undefined}
          onClose={() => {
            const params = new URLSearchParams(searchParams);
            params.delete("traceId");
            params.delete("spanId");
            router.push(`${pathName}?${params.toString()}`);
            setTraceId(null);
          }}
          traceId={traceId}
          showChatInitial={showChatInitial}
        />
      )}
    </TraceViewNavigationProvider>
  );
}

export default function Traces() {
  const searchParams = useSearchParams();

  const traceId = searchParams.get("traceId");
  const spanId = searchParams.get("spanId");

  return (
    <TracesStoreProvider traceId={traceId} spanId={spanId}>
      <TracesContent />
    </TracesStoreProvider>
  );
}
