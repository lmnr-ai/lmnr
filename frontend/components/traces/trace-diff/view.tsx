"use client";

import { ArrowRight } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import Header from "@/components/ui/header";
import { Skeleton } from "@/components/ui/skeleton";

import DiffColumns, { type SelectingSide } from "./diff-list";
import MappingError from "./mapping-error";
import MetricsBar from "./metrics-bar";
import { useTraceDiffStore } from "./store";
import { getAllCondensedBlockInputs } from "./timeline/timeline-utils";
import ViewModeToggle from "./timeline/view-mode-toggle";
import TraceIdPill from "./trace-id-pill";

interface TraceDiffViewInnerProps {
  leftTraceId: string;
  rightTraceId?: string;
}

const TraceDiffViewInner = ({ leftTraceId, rightTraceId }: TraceDiffViewInnerProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const phase = useTraceDiffStore((s) => s.phase);
  const isLeftLoading = useTraceDiffStore((s) => s.isLeftLoading);
  const isMappingLoading = useTraceDiffStore((s) => s.isMappingLoading);
  const isSummarizationLoading = useTraceDiffStore((s) => s.isSummarizationLoading);
  const mappingError = useTraceDiffStore((s) => s.mappingError);
  const leftTree = useTraceDiffStore((s) => s.leftTree);
  const rightTree = useTraceDiffStore((s) => s.rightTree);
  const maxTreeDepth = useTraceDiffStore((s) => s.maxTreeDepth);
  const retryCounter = useTraceDiffStore((s) => s.retryCounter);

  const setLeftData = useTraceDiffStore((s) => s.setLeftData);
  const setIsLeftLoading = useTraceDiffStore((s) => s.setIsLeftLoading);
  const setRightData = useTraceDiffStore((s) => s.setRightData);
  const setIsRightLoading = useTraceDiffStore((s) => s.setIsRightLoading);
  const setMapping = useTraceDiffStore((s) => s.setMapping);
  const setMappingError = useTraceDiffStore((s) => s.setMappingError);
  const setIsMappingLoading = useTraceDiffStore((s) => s.setIsMappingLoading);
  const addBlockSummaries = useTraceDiffStore((s) => s.addBlockSummaries);
  const setIsSummarizationLoading = useTraceDiffStore((s) => s.setIsSummarizationLoading);
  const retryMapping = useTraceDiffStore((s) => s.retryMapping);

  // ── Fetch trace data (trace metadata + spans) ────────────────────────

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

  // ── Effect 1: Fetch left trace ───────────────────────────────────────

  useEffect(() => {
    let stale = false;
    setIsLeftLoading(true);
    fetchTraceData(leftTraceId)
      .then(({ trace, spans }) => {
        if (!stale) setLeftData(trace, spans);
      })
      .catch((e) => {
        if (!stale) {
          console.error("Failed to fetch left trace:", e);
          setIsLeftLoading(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [leftTraceId, fetchTraceData, setLeftData, setIsLeftLoading]);

  // ── Effect 2: Fetch right trace ──────────────────────────────────────

  useEffect(() => {
    if (!rightTraceId) return;
    let stale = false;
    setIsRightLoading(true);
    fetchTraceData(rightTraceId)
      .then(({ trace, spans }) => {
        if (!stale) setRightData(trace, spans);
      })
      .catch((e) => {
        if (!stale) {
          console.error("Failed to fetch right trace:", e);
          setIsRightLoading(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [rightTraceId, fetchTraceData, setRightData, setIsRightLoading]);

  // ── Effect 3: Run analysis when both trees are ready ─────────────────
  //
  // Triggers when leftTree or rightTree change (set by setLeftData/setRightData),
  // or on retry. Fires parallel HTTP requests for context, mapping, and summaries.

  useEffect(() => {
    if (!leftTree || !rightTree || !rightTraceId || maxTreeDepth === 0) return;

    const abort = new AbortController();
    setIsMappingLoading(true);
    setIsSummarizationLoading(true);

    const leftBlocks = getAllCondensedBlockInputs(leftTree, maxTreeDepth);
    const rightBlocks = getAllCondensedBlockInputs(rightTree, maxTreeDepth);

    const diffBase = `/api/projects/${projectId}/traces/diff`;
    const post = (url: string, body: unknown) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });

    // Step 1: Build context for both traces in parallel
    Promise.all([
      post(`${diffBase}/build-context`, { traceId: leftTraceId, excludeDefault: true }).then((r) => {
        if (!r.ok) throw new Error("Failed to build left trace context");
        return r.json();
      }),
      post(`${diffBase}/build-context`, { traceId: rightTraceId, excludeDefault: true }).then((r) => {
        if (!r.ok) throw new Error("Failed to build right trace context");
        return r.json();
      }),
    ])
      .then(([leftCtx, rightCtx]) => {
        if (abort.signal.aborted) return;

        const leftSpanIds = leftCtx.spanInfos.map((s: { spanId: string }) => s.spanId);
        const rightSpanIds = rightCtx.spanInfos.map((s: { spanId: string }) => s.spanId);

        // Step 2: Fire mapping + summarization in parallel
        post(`${diffBase}/mapping`, {
          leftTraceString: leftCtx.traceString,
          rightTraceString: rightCtx.traceString,
          leftSpanIds,
          rightSpanIds,
        })
          .then(async (r) => {
            if (!r.ok) throw new Error((await r.json()).error ?? "Mapping failed");
            return r.json();
          })
          .then(({ mapping }: { mapping: [string, string][] }) => {
            if (!abort.signal.aborted) setMapping(mapping);
          })
          .catch((e: unknown) => {
            if (abort.signal.aborted) return;
            console.error("Mapping failed:", e);
            setMappingError(e instanceof Error ? e.message : "Failed to analyze trace diff");
          });

        const mergeSummaries = (results: { blockId: string; summary: string; icon: string }[]) => {
          if (abort.signal.aborted) return;
          const map: Record<string, { summary: string; icon: string }> = {};
          for (const r of results) map[r.blockId] = { summary: r.summary, icon: r.icon };
          addBlockSummaries(map);
        };

        let pending = 2;
        const onDone = () => {
          if (--pending === 0 && !abort.signal.aborted) setIsSummarizationLoading(false);
        };

        const summarize = (traceString: string, blocks: unknown[]) =>
          blocks.length > 0
            ? post(`${diffBase}/summarize`, { traceString, blocks })
                .then(async (r) => {
                  if (!r.ok) throw new Error((await r.json()).error ?? "Summarize failed");
                  return r.json();
                })
                .then(mergeSummaries)
                .catch((e: unknown) => console.error("Summarization failed:", e))
                .finally(onDone)
            : Promise.resolve(onDone());

        summarize(leftCtx.traceString, leftBlocks);
        summarize(rightCtx.traceString, rightBlocks);
      })
      .catch((e) => {
        if (abort.signal.aborted) return;
        console.error("Failed to fetch trace context:", e);
        setMappingError(e instanceof Error ? e.message : "Failed to build trace context");
      });

    return () => {
      abort.abort();
    };
  }, [
    leftTree,
    rightTree,
    maxTreeDepth,
    projectId,
    leftTraceId,
    rightTraceId,
    retryCounter,
    setIsMappingLoading,
    setIsSummarizationLoading,
    setMapping,
    setMappingError,
    addBlockSummaries,
  ]);

  // ── Trace selection handlers ─────────────────────────────────────────

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
          <div className="px-4 pb-2 flex items-center gap-2">
            <ViewModeToggle />
            <MetricsBar />
          </div>
          {(phase === "loading" || isMappingLoading || isSummarizationLoading) && (
            <div className="flex-none flex items-center justify-center py-2 bg-secondary border-b border-b-background">
              <span className="text-sm text-muted-foreground shimmer">Analyzing traces</span>
            </div>
          )}
          {phase === "error" && (
            <MappingError error={mappingError ?? "Failed to analyze traces"} onRetry={retryMapping} />
          )}
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
