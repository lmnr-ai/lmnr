"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import EventsTable from "@/components/signal/events-table";
import { signalTabSearch } from "@/components/signal/hooks/signal-tab-search";
import { useSignalTraceParams } from "@/components/signal/hooks/use-signal-trace-params";
import SignalRunsTable from "@/components/signal/runs-table";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type ManageSignalForm, ManageSignalPanel } from "@/components/signals/create-signal-drawer";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import Header from "@/components/ui/header.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { track } from "@/lib/posthog";

interface SignalProps {
  slackClientId?: string;
  slackRedirectUri?: string;
  slackBrokerEnabled?: boolean;
}

export default function Signal({ slackClientId, slackRedirectUri, slackBrokerEnabled }: SignalProps) {
  const pathName = usePathname();
  const params = useParams<{ projectId: string }>();
  const { push, replace } = useRouter();
  const searchParams = useSearchParams();
  const [{ traceId, spanId }, setTraceParams] = useSignalTraceParams();

  // Old bookmarks: ?tab=settings&section=activity, then ?tab=activity.
  const tabParam = searchParams.get("tab");
  const isLegacyRunsTab = tabParam === "activity" || searchParams.get("section") === "activity";
  const activeTab = isLegacyRunsTab ? "runs" : tabParam || "events";

  useEffect(() => {
    if (!isLegacyRunsTab) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "runs");
    next.delete("section");
    replace(`${pathName}?${next.toString()}`);
  }, [isLegacyRunsTab, searchParams, pathName, replace]);

  const { signal } = useSignalStoreContext((state) => ({
    signal: state.signal,
  }));

  const setSignal = useSignalStoreContext((state) => state.setSignal);

  const handleSuccess = useCallback(
    async (form: ManageSignalForm) => {
      setSignal({
        ...signal,
        name: form.name,
        prompt: form.prompt,
        schemaFields: form.schemaFields,
        triggers: form.triggers,
        sampleRate: form.sampleRate,
        disabled: form.disabled,
      });
    },
    [signal, setSignal]
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      track("signals", "tab_viewed", { signalId: signal.id, tab });
      push(`${pathName}?${signalTabSearch(searchParams.toString(), tab).toString()}`);
    },
    [pathName, push, searchParams, signal.id]
  );

  return (
    <>
      <Header path={[{ name: "signals", href: `/project/${params.projectId}/signals` }, { name: signal.name }]} />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col gap-6 overflow-hidden">
        <div className="px-4">
          <TabsList className="h-8">
            <TabsTrigger className="text-xs" value="events">
              Events
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="runs">
              Runs
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="settings">
              Settings
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="events" className="flex flex-col overflow-hidden">
          <EventsTable />
        </TabsContent>
        <TabsContent value="runs" className="flex flex-col overflow-hidden">
          <SignalRunsTable />
        </TabsContent>
        <TabsContent value="settings" className="flex flex-col overflow-hidden">
          <ManageSignalPanel
            key={signal.id}
            defaultValues={signal}
            onSuccess={handleSuccess}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
            slackBrokerEnabled={slackBrokerEnabled}
          />
        </TabsContent>
      </Tabs>

      {traceId && (
        <TraceViewSidePanel
          spanId={spanId || undefined}
          key={traceId}
          onClose={() => {
            void setTraceParams({ traceId: null, spanId: null, eventId: null });
          }}
          traceId={traceId}
          initialSignalId={signal.id}
        />
      )}
    </>
  );
}
