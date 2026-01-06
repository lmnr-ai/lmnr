"use client";

import React from "react";

import Placeholder from "@/components/rollout-sessions/placeholder";
import RolloutSessionView from "@/components/rollout-sessions/rollout-session-view";
import RolloutSessionStoreProvider, {
  TraceViewTrace,
} from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import Header from "@/components/ui/header";
import FiltersContextProvider from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { RolloutSessionStatus } from "@/lib/actions/rollout-sessions";

interface RolloutSessionContentProps {
  sessionId: string;
  trace?: TraceViewTrace;
}

const RolloutSessionContent = ({ sessionId, trace }: RolloutSessionContentProps) => {
  if (!trace) {
    return <Placeholder sessionId={sessionId} />;
  }

  return (
    <div className="flex-1 min-h-0 flex">
      <FiltersContextProvider>
        <RolloutSessionView sessionId={sessionId} propsTrace={trace} traceId={trace.id} />
      </FiltersContextProvider>
    </div>
  );
};

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
}) => (
  <>
    <Header
      path={[
        { name: "rollout-sessions", href: `/project/${projectId}/rollout-sessions` },
        { name: sessionId, copyValue: sessionId },
      ]}
      childrenContainerClassName="flex-none mr-2 h-12"
    />
    <div className="flex-none border-t" />
    <RolloutSessionStoreProvider
      trace={trace}
      params={params}
      storeKey={`rollout-session-${sessionId}`}
      initialStatus={initialStatus}
      initialTraceId={trace?.id ?? ""}
    >
      <RolloutSessionContent sessionId={sessionId} trace={trace} />
    </RolloutSessionStoreProvider>
  </>
);

export default RolloutSession;
