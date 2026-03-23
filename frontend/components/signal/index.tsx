"use client";

import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import EventsTable from "@/components/signal/events-table";
import SignalJobsTable from "@/components/signal/jobs-table";
import SignalRunsTable from "@/components/signal/runs-table";
import SignalOverviewTooltip from "@/components/signal/signal-overview-tooltip";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type EventNavigationItem, getEventsConfig } from "@/components/signal/utils";
import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import TraceViewNavigationProvider from "@/components/traces/trace-view/navigation-context";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectContext } from "@/contexts/project-context";

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

  const activeTab = searchParams.get("tab") || "events";

  const { signal } = useSignalStoreContext((state) => ({
    signal: state.signal,
  }));

  const { setSignal, traceId, spanId, setTraceId, setSpanId } = useSignalStoreContext((state) => ({
    setSignal: state.setSignal,
    traceId: state.traceId,
    spanId: state.spanId,
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
  }));

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
            <Button icon="edit" onClick={() => setIsSheetOpen(true)}>
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

      {traceId && (
        <TraceViewSidePanel
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
          initialSignalsPanelOpen
        />
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
