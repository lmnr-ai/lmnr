"use client";

import React from "react";

import RolloutSessionView from "@/components/rollout-sessions/rollout-session-view";
import { TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import Header from "@/components/ui/header";
import FiltersContextProvider from "@/components/ui/infinite-datatable/ui/datatable-filter/context";

const RolloutSession = ({ sessionId, trace }: { sessionId: string; trace: TraceViewTrace }) => (
  <>
    <Header path={`rollout-sessions/${sessionId}`} childrenContainerClassName="flex-none mr-2 h-12" />
    <div className="flex-none border-t" />
    <div className="flex-1 min-h-0 flex">
      <FiltersContextProvider>
        <RolloutSessionView sessionId={sessionId} propsTrace={trace} onClose={() => {}} traceId={trace.id} />
      </FiltersContextProvider>
    </div>
  </>
);

export default RolloutSession;
