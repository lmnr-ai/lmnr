"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import SignalClusters from "@/components/signal-clusters";
import { useSignalTraceParams } from "@/components/signal/hooks/use-signal-trace-params";
import SignalRunsTable from "@/components/signal/runs-table";
import SignalPageTabs from "@/components/signal/signal-page-tabs";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type ManageSignalForm, ManageSignalPanel } from "@/components/signals/create-signal-drawer";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import { navigateTracePanel } from "@/components/traces/trace-view/trace-panel-url";
import Header from "@/components/ui/header.tsx";
import { readSignalSettings } from "@/lib/signals/settings";

interface SignalProps {
  slackClientId?: string;
  slackRedirectUri?: string;
  slackBrokerEnabled?: boolean;
}

export default function Signal({ slackClientId, slackRedirectUri, slackBrokerEnabled }: SignalProps) {
  const pathName = usePathname();
  const params = useParams<{ projectId: string }>();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const [{ traceId, spanId }] = useSignalTraceParams();

  // Old bookmarks: ?tab=settings&section=activity, then ?tab=activity.
  const tabParam = searchParams.get("tab");
  const isLegacyRunsTab = tabParam === "activity" || searchParams.get("section") === "activity";
  // Clusters are the default view and replace Events; old ?tab=events links land on them.
  const activeTab = isLegacyRunsTab ? "runs" : tabParam === "runs" || tabParam === "settings" ? tabParam : null;

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
        llmProfileId: form.llmProfileId,
        llmModel: form.llmModel,
        ...readSignalSettings(form),
      });
    },
    [signal, setSignal]
  );

  const tracePanel = traceId && (
    <TraceViewSidePanel
      urlState
      spanId={spanId || undefined}
      key={traceId}
      onClose={() => {
        navigateTracePanel({ type: "close" }, { eventId: null });
      }}
      traceId={traceId}
      initialSignalId={signal.id}
    />
  );

  if (!activeTab) {
    return (
      <>
        <SignalClusters
          projectId={params.projectId}
          signalId={signal.id}
          header={
            <Header path={[{ name: "signals" }, { name: signal.name }]} childrenContainerClassName="whitespace-nowrap">
              <SignalPageTabs signalId={signal.id} active="clusters" />
            </Header>
          }
          onOpenTrace={(id) => navigateTracePanel({ type: "open", traceId: id }, { eventId: null })}
        />
        {tracePanel}
      </>
    );
  }

  return (
    <>
      <Header path={[{ name: "signals" }, { name: signal.name }]} childrenContainerClassName="whitespace-nowrap">
        <SignalPageTabs signalId={signal.id} active={activeTab} />
      </Header>
      {/* Same nesting the old tab panels had, so runs and settings lay out as before. */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-col overflow-hidden">
          {activeTab === "runs" ? (
            <SignalRunsTable />
          ) : (
            <ManageSignalPanel
              key={signal.id}
              defaultValues={signal}
              onSuccess={handleSuccess}
              slackClientId={slackClientId}
              slackRedirectUri={slackRedirectUri}
              slackBrokerEnabled={slackBrokerEnabled}
            />
          )}
        </div>
      </div>
      {tracePanel}
    </>
  );
}
