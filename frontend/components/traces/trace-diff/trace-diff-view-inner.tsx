"use client";

import { ArrowRight } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import Header from "@/components/ui/header";
import { Skeleton } from "@/components/ui/skeleton";
import { generateSpanMapping } from "@/lib/actions/trace/diff";

import DiffColumns, { type SelectingSide } from "./diff-columns";
import MetricsBar from "./metrics-bar";
import { useTraceDiffStore } from "./trace-diff-store";
import TraceIdPill from "./trace-id-pill";

interface TraceDiffViewInnerProps {
  leftTraceId: string;
  rightTraceId?: string;
}

const TraceDiffViewInner = ({ leftTraceId, rightTraceId }: TraceDiffViewInnerProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    phase,
    isLeftLoading,
    retryCounter,
    setLeftData,
    setIsLeftLoading,
    setRightData,
    setIsRightLoading,
    setIsMappingLoading,
    setMapping,
    setMappingError,
  } = useTraceDiffStore((s) => ({
    phase: s.phase,
    isLeftLoading: s.isLeftLoading,
    retryCounter: s.retryCounter,
    setLeftData: s.setLeftData,
    setIsLeftLoading: s.setIsLeftLoading,
    setRightData: s.setRightData,
    setIsRightLoading: s.setIsRightLoading,
    setIsMappingLoading: s.setIsMappingLoading,
    setMapping: s.setMapping,
    setMappingError: s.setMappingError,
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

    let stale = false;
    setIsMappingLoading(true);
    generateSpanMapping(projectId, leftTraceId, rightTraceId)
      .then((mapping) => {
        if (!stale) setMapping(mapping);
      })
      .catch((e) => {
        if (!stale) {
          console.error("Failed to compute mapping:", e);
          setMappingError(e instanceof Error ? e.message : "Failed to analyze trace diff");
        }
      });

    return () => {
      stale = true;
    };
  }, [phase, projectId, leftTraceId, rightTraceId, retryCounter, setIsMappingLoading, setMapping, setMappingError]);

  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const handleSelectLeft = useCallback(
    (traceId: string) => {
      const params = new URLSearchParams(searchParamsRef.current);
      params.set("left", traceId);
      router.replace(`?${params.toString()}`);
    },
    [router]
  );

  const handleSelectRight = useCallback(
    (traceId: string) => {
      const params = new URLSearchParams(searchParamsRef.current);
      params.set("right", traceId);
      router.replace(`?${params.toString()}`);
    },
    [router]
  );

  const [selectingSide, setSelectingSide] = useState<SelectingSide>(null);

  const breadcrumbSegments = [{ name: "traces", href: `/project/${projectId}/traces` }];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header path={breadcrumbSegments}>
        <div className="text-secondary-foreground/40">/</div>
        <TraceIdPill
          traceId={leftTraceId}
          projectId={projectId}
          onSelectAnother={() => setSelectingSide("left")}
          selectAnotherDisabled={selectingSide !== null || isLeftLoading}
          className="ml-2"
        />
        {rightTraceId && (
          <>
            <ArrowRight className="size-3.5 text-secondary-foreground mx-2" />
            <TraceIdPill
              traceId={rightTraceId}
              projectId={projectId}
              onSelectAnother={() => setSelectingSide("right")}
              selectAnotherDisabled={selectingSide !== null || isLeftLoading}
            />
          </>
        )}
      </Header>
      {isLeftLoading ? (
        <>
          <div className="flex items-center gap-2 px-4 pb-2">
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
          <div className="flex flex-1 overflow-hidden border-t gap-0.5 p-1">
            <div className="flex-1 flex flex-col gap-0.5">
              <Skeleton className="h-28 w-full rounded-sm" />
              <Skeleton className="h-20 w-full rounded-sm" />
              <Skeleton className="h-36 w-full rounded-sm" />
              <Skeleton className="h-20 w-full rounded-sm" />
            </div>
            <div className="flex-1 flex flex-col gap-0.5">
              <Skeleton className="h-28 w-full rounded-sm" />
              <Skeleton className="h-20 w-full rounded-sm" />
              <Skeleton className="h-36 w-full rounded-sm" />
              <Skeleton className="h-20 w-full rounded-sm" />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="px-4 pb-2">
            <MetricsBar />
          </div>
          <DiffColumns
            onSelectLeft={handleSelectLeft}
            onSelectRight={handleSelectRight}
            selectingSide={selectingSide}
            setSelectingSide={setSelectingSide}
          />
        </>
      )}
    </div>
  );
};

export default TraceDiffViewInner;
