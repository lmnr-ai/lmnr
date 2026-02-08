"use client";

import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable, type ResizeCallback } from "re-resizable";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ClustersTable from "@/components/signal/clusters-table";
import EventsTable from "@/components/signal/events-table";
import SignalJobsTable from "@/components/signal/jobs-table";
import SignalRunsTable from "@/components/signal/runs-table";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import TriggersTable from "@/components/signal/triggers-table";
import { type EventNavigationItem, getEventsConfig } from "@/components/signal/utils";
import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet.tsx";
import TraceView from "@/components/traces/trace-view";
import TraceViewNavigationProvider from "@/components/traces/trace-view/navigation-context";
import { getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectContext } from "@/contexts/project-context";
import { setEventsTraceViewWidthCookie } from "@/lib/actions/traces/cookies";

const ManageSignalSheet = dynamic(
  () => import("@/components/signals/manage-signal-sheet.tsx").then((mod) => mod.default),
  { ssr: false }
);

function SignalContent() {
  const pathName = usePathname();
  const params = useParams<{ projectId: string }>();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const ref = useRef<Resizable>(null);
  const { workspace } = useProjectContext();

  const activeTab = searchParams.get("tab") || "events";

  const { signal, initialTraceViewWidth } = useSignalStoreContext((state) => ({
    signal: state.signal,
    initialTraceViewWidth: state.initialTraceViewWidth,
  }));

  const { setSignal, traceId, spanId, setTraceId, setSpanId } = useSignalStoreContext((state) => ({
    setSignal: state.setSignal,
    traceId: state.traceId,
    spanId: state.spanId,
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
  }));

  const [defaultTraceViewWidth, setDefaultTraceViewWidth] = React.useState(initialTraceViewWidth || 1000);
  const isFreeTier = workspace?.tierName.toLowerCase().trim() === "free";

  useEffect(() => {
    if (!initialTraceViewWidth) {
      setDefaultTraceViewWidth(getDefaultTraceViewWidth());
    }
  }, [initialTraceViewWidth]);

  const handleSuccess = useCallback(
    async (form: ManageSignalForm) => {
      setSignal({
        ...signal,
        prompt: form.prompt,
        schemaFields: form.schemaFields,
      });
    },
    [signal, setSignal]
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("tab", tab);
      push(`${pathName}?${params.toString()}`);
    },
    [pathName, push, searchParams]
  );

  const handleResizeStop: ResizeCallback = (_event, _direction, _elementRef, delta) => {
    const newWidth = defaultTraceViewWidth + delta.width;
    setDefaultTraceViewWidth(newWidth);
    setEventsTraceViewWidthCookie(newWidth).catch((e) => console.warn(`Failed to save value to cookies. ${e}`));
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (defaultTraceViewWidth > window.innerWidth - 180) {
        const newWidth = window.innerWidth - 240;
        setDefaultTraceViewWidth(newWidth);
        setEventsTraceViewWidthCookie(newWidth);
        ref?.current?.updateSize({ width: newWidth });
      }
    }
  }, [defaultTraceViewWidth]);

  return (
    <>
      <Header path={[{ name: "signals", href: `/project/${params.projectId}/signals` }, { name: signal.name }]} />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center gap-4 px-4">
          <TabsList className="h-8">
            <TabsTrigger className="text-xs" value="events">
              Events
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="triggers">
              Triggers
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="jobs">
              Jobs
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="runs">
              Runs
            </TabsTrigger>
          </TabsList>
          {!isFreeTier && (
            <ManageSignalSheet
              open={isDialogOpen}
              setOpen={setIsDialogOpen}
              defaultValues={signal}
              key={signal.id}
              onSuccess={handleSuccess}
            >
              <Button icon="edit" variant="secondary">
                Edit Signal
              </Button>
            </ManageSignalSheet>
          )}
        </div>

        <TabsContent value="events" className="flex flex-col gap-4 px-4 pb-4 overflow-auto">
          <ClustersTable />
          <EventsTable />
        </TabsContent>
        <TabsContent value="triggers" className="flex flex-col gap-4 px-4 pb-4 overflow-hidden">
          <TriggersTable />
        </TabsContent>
        <TabsContent value="jobs" className="flex flex-col gap-4 px-4 pb-4 overflow-hidden">
          <SignalJobsTable />
        </TabsContent>
        <TabsContent value="runs" className="flex flex-col gap-4 px-4 pb-4 overflow-hidden">
          <SignalRunsTable />
        </TabsContent>
      </Tabs>
      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-60 flex pointer-events-auto">
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
                push(`${pathName}?${params.toString()}`);
                setTraceId(null);
                setSpanId(null);
              }}
              traceId={traceId}
            />
          </Resizable>
        </div>
      )}
    </>
  );
}

export default function Signal({ traceId }: { traceId?: string }) {
  const { setTraceId } = useSignalStoreContext((state) => ({
    setTraceId: state.setTraceId,
  }));

  const handleNavigate = useCallback(
    (item: EventNavigationItem | null) => {
      if (item) {
        setTraceId(item.traceId);
      }
    },
    [setTraceId]
  );

  useEffect(() => {
    if (traceId) setTraceId(traceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TraceViewNavigationProvider<EventNavigationItem> config={getEventsConfig()} onNavigate={handleNavigate}>
      <SignalContent />
    </TraceViewNavigationProvider>
  );
}
