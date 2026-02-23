"use client";

import React from "react";

import RolloutSessionView from "@/components/rollout-sessions/rollout-session-view";
import RolloutSessionStoreProvider from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import Header from "@/components/ui/header";
import { type RolloutSession as RolloutSessionType, type RolloutSessionStatus } from "@/lib/actions/rollout-sessions";

interface RolloutSessionContentProps {
  sessionId: string;
}

const RolloutSessionContent = ({ sessionId }: RolloutSessionContentProps) => (
  <div className="flex-1 min-h-0 flex">
    <RolloutSessionView sessionId={sessionId} />
  </div>
);

const RolloutSession = ({
  projectId,
  params,
  session,
  trace,
  initialStatus,
}: {
  projectId: string;
  params: Array<any>;
  session: RolloutSessionType;
  trace?: TraceViewTrace;
  initialStatus?: RolloutSessionStatus;
}) => (
  <>
    <Header
      path={[
        { name: "rollout-sessions", href: `/project/${projectId}/rollout-sessions` },
        { name: session.name ?? "-", copyValue: session.id },
      ]}
      childrenContainerClassName="flex-none mr-2 h-12"
    />
    <div className="flex-none border-t" />
    <RolloutSessionStoreProvider
      trace={trace}
      params={params}
      storeKey={`rollout-session-${session.id}`}
      initialStatus={initialStatus}
    >
      <RolloutSessionContent sessionId={session.id} />
    </RolloutSessionStoreProvider>
  </>
);

export default RolloutSession;
