"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { shallow } from "zustand/shallow";

import TraceViewNavigationProvider, { getTracesConfig } from "@/components/traces/trace-view/navigation-context";
import { useTracePanelNavigate } from "@/components/traces/trace-view/trace-panel-url";

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
  const navigate = useTracePanelNavigate();
  const tracesTab = (searchParams.get("view") || TracesTab.TRACES) as TracesTab;

  const { traceId, spanId, setTraceId, setSpanId } = useTracesStoreContext(
    (state) => ({
      spanId: state.spanId,
      traceId: state.traceId,
      setTraceId: state.setTraceId,
      setSpanId: state.setSpanId,
    }),
    shallow
  );

  const resetUrlParams = (newView: string) => {
    navigate({ type: "close" }, (params) => {
      params.delete("filter");
      params.delete("textSearch");
      params.set("view", newView);
    });
    setTraceId(null);
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
        className="flex flex-1 min-h-0 overflow-hidden gap-4"
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
          urlState
          spanId={spanId || undefined}
          onClose={() => {
            navigate({ type: "close" });
            setTraceId(null);
          }}
          traceId={traceId}
          initialSearch={searchParams.get("search") ?? undefined}
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
