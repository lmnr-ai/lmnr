"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";

import { useBatchedSpanOutputs } from "@/components/traces/trace-view/list/use-batched-span-outputs";
import { type TraceViewListSpan } from "@/components/traces/trace-view/store/base";

import SpanCell from "./span-cell";

const SingleColumnSpanList = ({
  spans,
  traceRef,
}: {
  spans: TraceViewListSpan[];
  traceRef?: { id: string; startTime: string; endTime: string };
}) => {
  const { projectId } = useParams<{ projectId: string }>();
  const spanIds = useMemo(() => spans.map((s) => s.spanId), [spans]);
  const { outputs } = useBatchedSpanOutputs(projectId, traceRef ? spanIds : [], traceRef ?? {});

  return (
    <div className="flex-1 overflow-y-auto styled-scrollbar pt-2 flex flex-col gap-0.5">
      {spans.map((span) => (
        <div key={span.spanId} className="bg-secondary rounded-sm">
          <SpanCell span={span} output={outputs[span.spanId]} />
        </div>
      ))}
    </div>
  );
};

export default SingleColumnSpanList;
