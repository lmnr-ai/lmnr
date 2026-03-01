"use client";

import { ArrowRight, Loader } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import CopyTooltip from "@/components/ui/copy-tooltip";
import Header from "@/components/ui/header";
import { generateSpanMapping } from "@/lib/actions/trace/diff";

import DiffColumns from "./diff-columns";
import MetricsBar from "./metrics-bar";
import { TraceDiffStoreProvider, useTraceDiffStore } from "./trace-diff-store";

interface TraceDiffViewProps {
  leftTraceId: string;
  rightTraceId?: string;
}

function TraceDiffViewInner({ leftTraceId, rightTraceId }: TraceDiffViewProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    phase,
    isLeftLoading,
    setLeftData,
    setIsLeftLoading,
    setRightData,
    setIsRightLoading,
    setIsMappingLoading,
    setMapping,
  } = useTraceDiffStore((s) => ({
    phase: s.phase,
    isLeftLoading: s.isLeftLoading,
    setLeftData: s.setLeftData,
    setIsLeftLoading: s.setIsLeftLoading,
    setRightData: s.setRightData,
    setIsRightLoading: s.setIsRightLoading,
    setIsMappingLoading: s.setIsMappingLoading,
    setMapping: s.setMapping,
  }));

  // Fetch a trace + its spans
  const fetchTraceData = useCallback(
    async (traceId: string) => {
      const traceRes = await fetch(`/api/projects/${projectId}/traces/${traceId}`);
      if (!traceRes.ok) throw new Error("Failed to fetch trace");
      const trace = (await traceRes.json()) as TraceViewTrace;

      const params = new URLSearchParams();
      params.append("searchIn", "input");
      params.append("searchIn", "output");
      const startDate = new Date(new Date(trace.startTime).getTime() - 1000);
      const endDate = new Date(new Date(trace.endTime).getTime() + 1000);
      params.set("startDate", startDate.toISOString());
      params.set("endDate", endDate.toISOString());

      const spansRes = await fetch(`/api/projects/${projectId}/traces/${traceId}/spans?${params.toString()}`);
      if (!spansRes.ok) throw new Error("Failed to fetch spans");
      const spans = enrichSpansWithPending((await spansRes.json()) as TraceViewSpan[]);

      return { trace, spans };
    },
    [projectId]
  );

  // Fetch left trace on mount
  useEffect(() => {
    setIsLeftLoading(true);
    fetchTraceData(leftTraceId)
      .then(({ trace, spans }) => setLeftData(trace, spans))
      .catch((e) => {
        console.error("Failed to fetch left trace:", e);
        setIsLeftLoading(false);
      });
  }, [leftTraceId, fetchTraceData, setLeftData, setIsLeftLoading]);

  // Fetch right trace when specified
  useEffect(() => {
    if (!rightTraceId) return;

    setIsRightLoading(true);
    fetchTraceData(rightTraceId)
      .then(({ trace, spans }) => setRightData(trace, spans))
      .catch((e) => {
        console.error("Failed to fetch right trace:", e);
        setIsRightLoading(false);
      });
  }, [rightTraceId, fetchTraceData, setRightData, setIsRightLoading]);

  // Trigger mapping when both sides have data and phase is 'loading'
  useEffect(() => {
    if (phase !== "loading") return;
    if (!rightTraceId) return;

    setIsMappingLoading(true);
    generateSpanMapping(projectId, leftTraceId, rightTraceId)
      .then((mapping) => setMapping(mapping))
      .catch((e) => {
        console.error("Failed to compute mapping:", e);
        setIsMappingLoading(false);
      });
  }, [phase, projectId, leftTraceId, rightTraceId, setIsMappingLoading, setMapping]);

  const handleSelectLeft = useCallback(
    (traceId: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("left", traceId);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSelectRight = useCallback(
    (traceId: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("right", traceId);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  if (isLeftLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader className="size-4 animate-spin" />
        Loading trace...
      </div>
    );
  }

  const breadcrumbSegments = [
    { name: "traces", href: `/project/${projectId}/traces` },
    { name: `${leftTraceId.slice(0, 8)}...`, copyValue: leftTraceId },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header path={breadcrumbSegments}>
        {rightTraceId && (
          <>
            <ArrowRight className="size-3.5 text-secondary-foreground" />
            <CopyTooltip value={rightTraceId}>
              <span className="px-2">{rightTraceId.slice(0, 8)}...</span>
            </CopyTooltip>
          </>
        )}
      </Header>
      <div className="px-4 pb-2">
        <MetricsBar />
      </div>
      <DiffColumns onSelectLeft={handleSelectLeft} onSelectRight={handleSelectRight} />
    </div>
  );
}

export default function TraceDiffView(props: TraceDiffViewProps) {
  return (
    <TraceDiffStoreProvider>
      <TraceDiffViewInner {...props} />
    </TraceDiffStoreProvider>
  );
}
