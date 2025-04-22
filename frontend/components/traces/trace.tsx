"use client";

import ShareTraceButton from "@/components/traces/share-trace-button";
import TraceView from "@/components/traces/trace-view";
import Header from "@/components/ui/header";
import { Trace as TraceType } from "@/lib/traces/types";

const Trace = ({ trace, projectId }: { trace: TraceType; projectId: string }) => (
  <>
    <Header path={`traces/${trace.id}`} childrenContainerClassName="flex-1 mr-2">
      <ShareTraceButton traceId={trace.id} projectId={projectId} />
    </Header>
    <TraceView propsTrace={trace} fullScreen onClose={() => {}} traceId={trace.id} />
  </>
);

export default Trace;
