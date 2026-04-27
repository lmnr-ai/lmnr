"use client";

import { Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EventsTable from "@/components/signal/events-table";
import SignalJobsTable from "@/components/signal/jobs-table";
import SignalRunsTable from "@/components/signal/runs-table";
import SignalTabCard from "@/components/signal/signal-tab-card";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type EventNavigationItem, getEventsConfig } from "@/components/signal/utils";
import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet";
import { getColumnName, getOperatorLabel } from "@/components/signals/trigger-filter-field";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import TraceViewNavigationProvider from "@/components/traces/trace-view/navigation-context";
import Header from "@/components/ui/header.tsx";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
        sampleRate: form.sampleRate,
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

  const triggersDescription = useMemo(() => {
    if (signal.triggers.length === 0) return "No triggers configured";
    return signal.triggers
      .map((trigger) =>
        trigger.filters
          .map((f) => `${getColumnName(f.column)} ${getOperatorLabel(f.column, f.operator)} ${f.value}`)
          .join(" and ")
      )
      .join(", ");
  }, [signal.triggers]);

  const openEditSheet = !isFreeTier ? () => setIsSheetOpen(true) : undefined;

  return (
    <>
      <Header path={[{ name: "signals", href: `/project/${params.projectId}/signals` }, { name: signal.name }]} />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-stretch gap-3 px-4">
          <SignalTabCard
            title="Events"
            description="Traces that match your definition"
            isActive={activeTab === "events"}
            onClick={() => handleTabChange("events")}
          />
          <SignalTabCard
            title="Jobs"
            description="Run on past traces"
            isActive={activeTab === "jobs"}
            onClick={() => handleTabChange("jobs")}
          />
          <SignalTabCard
            title="Runs"
            description="All signal runs"
            isActive={activeTab === "runs"}
            onClick={() => handleTabChange("runs")}
          />
          <SignalTabCard
            title={`Triggers (${signal.triggers.length})`}
            description={triggersDescription}
            onClick={openEditSheet}
          >
            <Pencil size={12} className="text-muted-foreground" />
          </SignalTabCard>
          {!isFreeTier && (
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="size-14 shrink-0 rounded-lg bg-primary border border-white/40 hover:bg-primary/90 flex items-center justify-center transition-colors"
              aria-label="Edit signal"
            >
              <Pencil className="size-4 text-primary-foreground" />
            </button>
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
          showChatInitial
          initialSignalId={signal.id}
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
