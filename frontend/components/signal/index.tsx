"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import EventsTable from "@/components/signal/events-table";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type EventNavigationItem, getEventsConfig } from "@/components/signal/utils";
import { type ManageSignalForm, ManageSignalPanel } from "@/components/signals/create-signal-drawer";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import TraceViewNavigationProvider from "@/components/traces/trace-view/navigation-context";
import Header from "@/components/ui/header.tsx";
import { useProjectContext } from "@/contexts/project-context";

function SignalContent() {
  const pathName = usePathname();
  const params = useParams<{ projectId: string }>();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const { workspace } = useProjectContext();

  const view = searchParams.get("view") ?? "events";

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
  const isSettings = view === "settings" && !isFreeTier;

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

  const headerPath = useMemo(
    () =>
      isSettings
        ? [
            { name: "signals", href: `/project/${params.projectId}/signals` },
            { name: signal.name, href: pathName },
            { name: "settings" },
          ]
        : [{ name: "signals", href: `/project/${params.projectId}/signals` }, { name: signal.name }],
    [isSettings, params.projectId, signal.name, pathName]
  );

  return (
    <>
      <Header path={headerPath} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {isSettings ? (
          <ManageSignalPanel
            key={signal.id}
            defaultValues={signal}
            onSuccess={handleSuccess}
            scrollAreaClassName="max-w-[900px] mx-auto pt-[36px]"
          />
        ) : (
          <EventsTable />
        )}
      </div>

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
