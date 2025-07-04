"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { Resizable, ResizeCallback } from "re-resizable";
import { useCallback, useEffect, useRef } from "react";

import TraceViewNavigationProvider, { getTracesConfig } from "@/components/traces/trace-view/navigation-context";
import { filterColumns } from "@/components/traces/trace-view/utils";
import { useUserContext } from "@/contexts/user-context";
import { setTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

import FiltersContextProvider from "../ui/datatable-filter/context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import SessionsTable from "./sessions-table";
import SpansTable from "./spans-table";
import TraceView from "./trace-view";
import { TracesStoreProvider, useTraceViewActions, useTraceViewState } from "./traces-store";
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
  const { email } = useUserContext();
  const posthog = usePostHog();
  const tracesTab = (searchParams.get("view") || TracesTab.TRACES) as TracesTab;

  const ref = useRef<Resizable>(null);
  const { traceId, defaultTraceViewWidth } = useTraceViewState();
  const { setTraceId, setSpanId, setDefaultTraceViewWidth } = useTraceViewActions();

  if (isFeatureEnabled(Feature.POSTHOG)) {
    posthog.identify(email);
  }

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

  const handleResizeStop: ResizeCallback = (_event, _direction, _elementRef, delta) => {
    const newWidth = defaultTraceViewWidth + delta.width;
    setDefaultTraceViewWidth(newWidth);
    setTraceViewWidthCookie(newWidth).catch((e) => console.warn(`Failed to save value to cookies. ${e}`));
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (defaultTraceViewWidth > window.innerWidth - 180) {
        const newWidth = window.innerWidth - 240;
        setDefaultTraceViewWidth(newWidth);
        setTraceViewWidthCookie(newWidth);
        ref?.current?.updateSize({ width: newWidth });
      }
    }
  }, [defaultTraceViewWidth, setDefaultTraceViewWidth]);

  return (
    <TraceViewNavigationProvider<NavigationItem> config={getTracesConfig()} onNavigate={handleNavigate}>
      <div className="flex flex-col flex-1">
        <Tabs
          value={tracesTab}
          className="flex flex-col h-full w-full"
          onValueChange={(value) => resetUrlParams(value)}
        >
          <TabsList className="w-full flex px-4 border-b text-sm">
            <TabsTrigger value="traces">Traces</TabsTrigger>
            <TabsTrigger value="spans">Spans</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
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
              <FiltersContextProvider columns={filterColumns}>
                <TraceView
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
              </FiltersContextProvider>
            </Resizable>
          </div>
        )}
      </div>
    </TraceViewNavigationProvider>
  );
}

export default function Traces({ initialTraceViewWidth }: { initialTraceViewWidth?: number }) {
  const searchParams = useSearchParams();

  const traceId = searchParams.get("traceId");
  const spanId = searchParams.get("spanId");

  return (
    <TracesStoreProvider traceId={traceId} spanId={spanId} defaultTraceViewWidth={initialTraceViewWidth}>
      <TracesContent />
    </TracesStoreProvider>
  );
}
