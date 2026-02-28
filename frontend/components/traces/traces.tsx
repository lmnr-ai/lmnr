"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback } from "react";

import TraceViewNavigationProvider, { getTracesConfig } from "@/components/traces/trace-view/navigation-context";
import { setTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { useResizableTraceViewWidth } from "@/lib/hooks/use-resizable-trace-view-width";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import SessionsTable from "./sessions-table";
import SpansTable from "./spans-table";
import TraceView from "./trace-view";
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

function TracesContent({ initialTraceViewWidth }: { initialTraceViewWidth?: number }) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const tracesTab = (searchParams.get("view") || TracesTab.TRACES) as TracesTab;

  const { traceId, spanId, setTraceId, setSpanId } = useTracesStoreContext((state) => ({
    spanId: state.spanId,
    traceId: state.traceId,
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
  }));

  const {
    width: defaultTraceViewWidth,
    resizableRef: ref,
    handleResizeStop,
  } = useResizableTraceViewWidth({
    initialWidth: initialTraceViewWidth,
    onSaveWidth: setTraceViewWidthCookie,
  });

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
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            ref={ref}
            onResizeStop={handleResizeStop}
            enable={{
              left: true,
            }}
            defaultSize={{
              width: defaultTraceViewWidth,
            }}
          >
            <TraceView
              spanId={spanId || undefined}
              key={traceId}
              onClose={() => {
                const params = new URLSearchParams(searchParams);
                params.delete("traceId");
                params.delete("spanId");
                router.push(`${pathName}?${params.toString()}`);
                setTraceId(null);
              }}
              traceId={traceId}
            />
          </Resizable>
        </div>
      )}
    </TraceViewNavigationProvider>
  );
}

export default function Traces({ initialTraceViewWidth }: { initialTraceViewWidth?: number }) {
  const searchParams = useSearchParams();

  const traceId = searchParams.get("traceId");
  const spanId = searchParams.get("spanId");

  return (
    <TracesStoreProvider traceId={traceId} spanId={spanId}>
      <TracesContent initialTraceViewWidth={initialTraceViewWidth} />
    </TracesStoreProvider>
  );
}
