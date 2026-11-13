"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { shallow } from "zustand/shallow";

import { SessionPreviewSelectTraceProvider } from "@/components/traces/session-preview/select-trace-context";
import TraceViewNavigationProvider, { getTracesConfig } from "@/components/traces/trace-view/navigation-context";
import { navigateTracePanel } from "@/components/traces/trace-view/trace-panel-url";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import SessionsTable from "./sessions-table";
import SpansTable from "./spans-table";
import TraceHealthButton from "./trace-health";
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

  // The URL is the source of truth; the store mirrors it so the table highlights the row instantly.
  const pushOpenTrace = useCallback(
    (id: string | null, hostParams?: Record<string, string | null>) => {
      navigateTracePanel(id ? { type: "open", traceId: id } : { type: "close" }, hostParams);
      setSpanId(null);
      setTraceId(id);
    },
    [setSpanId, setTraceId]
  );

  const resetUrlParams = (newView: string) => pushOpenTrace(null, { filter: null, textSearch: null, view: newView });

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

  const openTrace = useCallback((id: string) => pushOpenTrace(id), [pushOpenTrace]);
  const closeTrace = useCallback(() => pushOpenTrace(null), [pushOpenTrace]);

  return (
    <SessionPreviewSelectTraceProvider value={openTrace}>
      <TraceViewNavigationProvider<NavigationItem> config={getTracesConfig()} onNavigate={handleNavigate}>
        <Tabs
          className="flex flex-1 min-h-0 overflow-hidden gap-4"
          value={tracesTab}
          onValueChange={(value) => resetUrlParams(value)}
        >
          <div className="mx-4 flex items-center gap-4">
            <TabsList className="h-8">
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
            <TraceHealthButton />
          </div>
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
        <TraceViewSidePanel
          urlState
          spanId={spanId || undefined}
          onClose={closeTrace}
          traceId={traceId}
          initialSearch={searchParams.get("search") ?? undefined}
        />
      </TraceViewNavigationProvider>
    </SessionPreviewSelectTraceProvider>
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
