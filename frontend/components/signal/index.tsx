"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import EventsTable from "@/components/signal/events-table";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type EventNavigationItem, getEventsConfig } from "@/components/signal/utils";
import { type ManageSignalForm, ManageSignalPanel } from "@/components/signals/create-signal-drawer";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import TraceViewNavigationProvider from "@/components/traces/trace-view/navigation-context";
import Header from "@/components/ui/header.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectContext } from "@/contexts/project-context";
import { track } from "@/lib/posthog";

function SignalContent() {
  const pathName = usePathname();
  const params = useParams<{ projectId: string }>();
  const { push } = useRouter();
  const searchParams = useSearchParams();
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
        name: form.name,
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
      track("signals", "tab_viewed", { signalId: signal.id, tab });
      const params = new URLSearchParams(searchParams);
      params.set("tab", tab);
      push(`${pathName}?${params.toString()}`);
    },
    [pathName, push, searchParams, signal.id]
  );

  return (
    <>
      <Header path={[{ name: "signals", href: `/project/${params.projectId}/signals` }, { name: signal.name }]} />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="px-4">
          <TabsList className="h-8">
            <TabsTrigger className="text-xs" value="events">
              Events
            </TabsTrigger>
            {!isFreeTier && (
              <TabsTrigger className="text-xs" value="settings">
                Settings
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="events" className="flex flex-col overflow-hidden">
          <EventsTable />
        </TabsContent>
        {!isFreeTier && (
          <TabsContent value="settings" className="flex flex-col overflow-hidden">
            <ManageSignalPanel
              key={signal.id}
              defaultValues={signal}
              onSuccess={handleSuccess}
              scrollAreaClassName="max-w-[900px] mx-auto pt-[36px]"
            />
          </TabsContent>
        )}
      </Tabs>

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
