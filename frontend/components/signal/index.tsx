"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useState } from "react";

import EventsTable from "@/components/signal/events-table";
import EventDetailPanel from "@/components/signal/events-table/event-detail-panel";
import { useEventId } from "@/components/signal/hooks/use-event-id";
import SignalJobsTable from "@/components/signal/jobs-table";
import SignalRunsTable from "@/components/signal/runs-table";
import SignalOverviewTooltip from "@/components/signal/signal-overview-tooltip";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type EventNavigationItem, getEventsConfig } from "@/components/signal/utils";
import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet";
import TraceView from "@/components/traces/trace-view";
import TraceViewNavigationProvider from "@/components/traces/trace-view/navigation-context";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectContext } from "@/contexts/project-context";
import { setEventsTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { useResizableTraceViewWidth } from "@/lib/hooks/use-resizable-trace-view-width";

const ManageSignalSheet = dynamic(
  () => import("@/components/signals/manage-signal-sheet/index.tsx").then((mod) => mod.default),
  { ssr: false }
);

function SignalContent() {
  const pathName = usePathname();
  const params = useParams<{ projectId: string }>();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { workspace } = useProjectContext();
  const [eventId, setEventId] = useEventId();

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

  const { width, handleResizeStop } = useResizableTraceViewWidth({
    initialWidth: initialTraceViewWidth,
    onSaveWidth: setEventsTraceViewWidthCookie,
  });

  const isFreeTier = workspace?.tierName.toLowerCase().trim() === "free";

  const handleSuccess = useCallback(
    async (form: ManageSignalForm) => {
      setSignal({
        ...signal,
        prompt: form.prompt,
        schemaFields: form.schemaFields,
        triggers: form.triggers,
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

  return (
    <>
      <Header path={[{ name: "signals", href: `/project/${params.projectId}/signals` }, { name: signal.name }]} />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center gap-4 px-4">
          <SignalOverviewTooltip
            signal={signal}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onEditClick={() => setIsSheetOpen(true)}
          >
            <TabsList className="h-8">
              <TabsTrigger className="text-xs" value="events">
                Events
              </TabsTrigger>
              <TabsTrigger className="text-xs" value="jobs">
                Jobs
              </TabsTrigger>
              <TabsTrigger className="text-xs" value="runs">
                Runs
              </TabsTrigger>
            </TabsList>
          </SignalOverviewTooltip>
          {!isFreeTier && (
            <Button icon="edit" variant="secondary" onClick={() => setIsSheetOpen(true)}>
              Edit Signal
            </Button>
          )}
        </div>

        <TabsContent value="events" className="flex flex-col overflow-hidden">
          <EventsTable />
        </TabsContent>
        <TabsContent value="jobs" className="flex flex-col gap-4 px-4 pb-4 overflow-hidden">
          <SignalJobsTable />
        </TabsContent>
        <TabsContent value="runs" className="flex flex-col gap-4 px-4 pb-4 overflow-hidden">
          <SignalRunsTable />
        </TabsContent>
      </Tabs>

      {!isFreeTier && (
        <ManageSignalSheet
          open={isSheetOpen}
          setOpen={setIsSheetOpen}
          defaultValues={signal}
          key={signal.id}
          onSuccess={handleSuccess}
        />
      )}

      <AnimatePresence>
        {eventId && (
          <motion.div
            key="event-drawer"
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="absolute top-0 right-0 bottom-0 bg-background border-l z-40 w-[400px]"
          >
            <EventDetailPanel
              eventId={eventId}
              signalId={signal.id}
              projectId={params.projectId}
              schemaFields={signal.schemaFields}
              onClose={() => {
                setEventId(null);
              }}
              onOpenTrace={(traceId) => {
                setEventId(null);
                setTraceId(traceId);
                const urlParams = new URLSearchParams(searchParams);
                urlParams.delete("eventId");
                urlParams.set("traceId", traceId);
                push(`${pathName}?${urlParams.toString()}`);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            onResizeStop={handleResizeStop}
            enable={{
              left: true,
            }}
            size={{
              width,
            }}
          >
            <TraceView
              spanId={spanId || undefined}
              key={traceId}
              onClose={() => {
                const urlParams = new URLSearchParams(searchParams);
                urlParams.delete("traceId");
                urlParams.delete("spanId");
                push(`${pathName}?${urlParams.toString()}`);
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
    setTraceId(traceId ?? null);
  }, [setTraceId, traceId]);

  return (
    <TraceViewNavigationProvider<EventNavigationItem> config={getEventsConfig()} onNavigate={handleNavigate}>
      <SignalContent />
    </TraceViewNavigationProvider>
  );
}
