"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import SignalClusters from "@/components/signal-clusters";
import { useSignalTraceParams } from "@/components/signal/hooks/use-signal-trace-params";
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

  // Old bookmarks: ?tab=runs, ?tab=activity and ?tab=settings&section=activity open Overview → Runs.
  const tabParam = searchParams.get("tab");
  const isLegacyRunsTab = tabParam === "runs" || tabParam === "activity" || searchParams.get("section") === "activity";
  // Clusters are the default view and replace Events; old ?tab=events links land on them.
  const showOverview = isLegacyRunsTab || tabParam === "settings";

  useEffect(() => {
    if (!isLegacyRunsTab) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "settings");
    next.set("section", "runs");
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

  // Rendering now would show Settings for a frame before the redirect above lands on Runs.
  if (isLegacyRunsTab) return null;

  if (!showOverview) {
    return (
      <>
        <SignalClusters
          projectId={params.projectId}
          signalId={signal.id}
          header={<Header path={[{ name: "signals" }, { name: signal.name }]} className="h-auto pt-[10px]" />}
          tabs={<SignalPageTabs signalId={signal.id} active="clusters" />}
          onOpenTrace={(id) => navigateTracePanel({ type: "open", traceId: id }, { eventId: null })}
        />
        {tracePanel}
      </>
    );
  }

  return (
    <>
      <Header path={[{ name: "signals" }, { name: signal.name }]} className="h-auto pt-[10px]" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ManageSignalPanel
          key={signal.id}
          defaultValues={signal}
          onSuccess={handleSuccess}
          slackClientId={slackClientId}
          slackRedirectUri={slackRedirectUri}
          slackBrokerEnabled={slackBrokerEnabled}
          sidebarHeader={<SignalPageTabs signalId={signal.id} active="settings" />}
          contentClassName="pt-10"
        />
      </div>
      {tracePanel}
    </>
  );
}
