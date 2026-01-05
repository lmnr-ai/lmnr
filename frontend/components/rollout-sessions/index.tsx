"use client";

import { Radio } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useMemo } from "react";

import RolloutSessionView from "@/components/rollout-sessions/rollout-session-view";
import RolloutSessionStoreProvider, {
  TraceViewTrace,
} from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import Header from "@/components/ui/header";
import FiltersContextProvider from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { RolloutSessionStatus } from "@/lib/actions/rollout-sessions";
import { useRealtime } from "@/lib/hooks/use-realtime";

const RolloutSession = ({
  projectId,
  params,
  sessionId,
  trace,
  initialStatus,
}: {
  projectId: string;
  params: Array<any>;
  sessionId: string;
  trace?: TraceViewTrace;
  initialStatus?: RolloutSessionStatus;
}) => {
  const router = useRouter();

  const eventHandlers = useMemo(
    () => ({
      span_update: () => {
        router.refresh();
      },
    }),
    [router]
  );

  useRealtime({
    key: `rollout_session_${sessionId}`,
    projectId,
    enabled: !trace,
    eventHandlers,
  });

  if (!trace) {
    return (
      <>
        <Header
          path={[
            { name: "rollout-sessions", href: `/project/${projectId}/rollout-sessions` },
            { name: sessionId, copyValue: sessionId },
          ]}
          childrenContainerClassName="flex-none mr-2 h-12"
        />
        <div className="flex-none border-t" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-4 p-6 rounded-lg border bg-card text-card-foreground">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm text-muted-foreground">Waiting for traces...</span>
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              When you run your code with this rollout session, traces will appear here.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        path={[
          { name: "rollout-sessions", href: `/project/${projectId}/rollout-sessions` },
          { name: sessionId, copyValue: sessionId },
        ]}
        childrenContainerClassName="flex-none mr-2 h-12"
      />
      <div className="flex-none border-t" />
      <div className="flex-1 min-h-0 flex">
        <RolloutSessionStoreProvider
          trace={trace}
          params={params}
          storeKey={`rollout-session-${sessionId}`}
          initialStatus={initialStatus}
        >
          <FiltersContextProvider>
            <RolloutSessionView sessionId={sessionId} propsTrace={trace} traceId={trace.id} />
          </FiltersContextProvider>
        </RolloutSessionStoreProvider>
      </div>
    </>
  );
};

export default RolloutSession;
