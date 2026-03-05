"use client";

import { ArrowRight } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import Header from "@/components/ui/header";
import { Skeleton } from "@/components/ui/skeleton";
import { generateSpanMapping } from "@/lib/actions/trace/diff";
import {
  type BlockSummaryInput,
  type BlockSummaryResult,
  type PartitionPlan,
  type PartitionSummaryResult,
} from "@/lib/actions/trace/diff/summarize";

import DiffColumns, { type SelectingSide } from "./diff-columns";
import MappingError from "./mapping-error";
import MetricsBar from "./metrics-bar";
import { getAllCondensedBlockInputs } from "./timeline/timeline-utils";
import ViewModeToggle from "./timeline/view-mode-toggle";
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
    leftTree,
    rightTree,
    maxTreeDepth,
    addBlockSummaries,
    setIsSummarizationLoading,
    isMappingLoading,
    isSummarizationLoading,
    mappingError,
    retryMapping,
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
    leftTree: s.leftTree,
    rightTree: s.rightTree,
    maxTreeDepth: s.maxTreeDepth,
    addBlockSummaries: s.addBlockSummaries,
    setIsSummarizationLoading: s.setIsSummarizationLoading,
    isMappingLoading: s.isMappingLoading,
    isSummarizationLoading: s.isSummarizationLoading,
    mappingError: s.mappingError,
    retryMapping: s.retryMapping,
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

  // Fetch right trace when specified
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

  // Trigger mapping when both sides have data and phase is 'loading'
  useEffect(() => {
    if (phase !== "loading") return;
    if (isLeftLoading) return;
    if (!rightTraceId) return;

    let stale = false;
    setIsMappingLoading(true);
    generateSpanMapping(projectId, leftTraceId, rightTraceId)
      .then(({ mapping, leftTraceString: lts, rightTraceString: rts }) => {
        if (!stale) setMapping(mapping, lts, rts);
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
  }, [
    phase,
    isLeftLoading,
    projectId,
    leftTraceId,
    rightTraceId,
    retryCounter,
    setIsMappingLoading,
    setMapping,
    setMappingError,
  ]);

  // Prefetch AI summaries for all condensed blocks at all depth levels
  const requestedBlockIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (maxTreeDepth === 0) return;

    // Collect new blocks per trace side, filtering out already-requested ones
    const leftBlocks = leftTree
      ? getAllCondensedBlockInputs(leftTree, maxTreeDepth).filter((b) => !requestedBlockIdsRef.current.has(b.blockId))
      : [];
    const rightBlocks = rightTree
      ? getAllCondensedBlockInputs(rightTree, maxTreeDepth).filter((b) => !requestedBlockIdsRef.current.has(b.blockId))
      : [];

    if (leftBlocks.length === 0 && rightBlocks.length === 0) return;

    for (const b of [...leftBlocks, ...rightBlocks]) {
      requestedBlockIdsRef.current.add(b.blockId);
    }

    setIsSummarizationLoading(true);

    const mergeSummaries = (results: BlockSummaryResult[]) => {
      if (results.length === 0) return;
      const summaryMap: Record<string, { summary: string; icon: string }> = {};
      for (const r of results) {
        summaryMap[r.blockId] = { summary: r.summary, icon: r.icon };
      }
      addBlockSummaries(summaryMap);
    };

    const summarizeUrl = (traceId: string) => `/api/projects/${projectId}/traces/${traceId}/summarize`;

    // Orchestrate per trace: plan → fire ALL requests in parallel (partitions + top-level).
    // Top-level fires immediately with placeholder summaries so it doesn't wait for partitions.
    const summarizeTrace = async (traceId: string, blocks: BlockSummaryInput[]) => {
      const shortId = traceId.slice(0, 8);
      const t0 = performance.now();

      console.log(`[client] plan-partitions FIRE trace=${shortId}`);
      const planRes = await fetch(summarizeUrl(traceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan-partitions", blocks }),
      });
      if (!planRes.ok) throw new Error(await planRes.text());
      const { plan } = (await planRes.json()) as { plan: PartitionPlan | null };
      console.log(
        `[client] plan-partitions DONE trace=${shortId} ${(performance.now() - t0).toFixed(0)}ms partitions=${plan?.partitions.length ?? 0}`
      );

      if (!plan) {
        // Small trace — single fetch
        const t1 = performance.now();
        console.log(`[client] summarize-blocks FIRE trace=${shortId}`);
        const res = await fetch(summarizeUrl(traceId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "summarize-blocks", blocks }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { results } = (await res.json()) as { results: BlockSummaryResult[] };
        console.log(
          `[client] summarize-blocks DONE trace=${shortId} ${(performance.now() - t1).toFixed(0)}ms results=${results.length}`
        );
        mergeSummaries(results);
        return;
      }

      // Fire ALL requests in parallel — partitions + top-level simultaneously.
      // Top-level gets empty deepSummaries (collapsed skeleton uses placeholder text).
      const blocksById = new Map(blocks.map((b) => [b.blockId, b]));
      const allPromises: Promise<void>[] = [];

      console.log(
        `[client] Firing ${plan.partitions.length} partition + top-level requests in parallel trace=${shortId}`
      );

      // Partition requests
      for (const partition of plan.partitions) {
        const partShort = partition.rootSpanId.slice(0, 8);
        allPromises.push(
          (async () => {
            const tp = performance.now();
            console.log(`[client] summarize-partition[${partShort}] FIRE trace=${shortId}`);
            const partitionBlocks = partition.blockIds.map((id) => blocksById.get(id)!).filter(Boolean);
            const res = await fetch(summarizeUrl(traceId), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "summarize-partition",
                partitionRootSpanId: partition.rootSpanId,
                blocks: partitionBlocks,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            const result = (await res.json()) as PartitionSummaryResult;
            console.log(
              `[client] summarize-partition[${partShort}] DONE trace=${shortId} ${(performance.now() - tp).toFixed(0)}ms results=${result.results.length}`
            );
            mergeSummaries(result.results);
          })()
        );
      }

      // Top-level request — fires in parallel, no need to wait for deepSummaries
      if (plan.topLevelBlockIds.length > 0) {
        allPromises.push(
          (async () => {
            const tt = performance.now();
            console.log(`[client] summarize-top-level FIRE trace=${shortId}`);
            const topLevelBlocks = plan.topLevelBlockIds.map((id) => blocksById.get(id)!).filter(Boolean);
            const partitionRootIds = plan.partitions.map((p) => p.rootSpanId);
            const res = await fetch(summarizeUrl(traceId), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "summarize-top-level",
                blocks: topLevelBlocks,
                deepSummaries: {},
                partitionRootIds,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            const { results } = (await res.json()) as { results: BlockSummaryResult[] };
            console.log(
              `[client] summarize-top-level DONE trace=${shortId} ${(performance.now() - tt).toFixed(0)}ms results=${results.length}`
            );
            mergeSummaries(results);
          })()
        );
      }

      await Promise.all(allPromises);
      console.log(`[client] summarizeTrace TOTAL trace=${shortId} ${(performance.now() - t0).toFixed(0)}ms`);
    };

    const promises: Promise<void>[] = [];
    if (leftBlocks.length > 0) {
      promises.push(summarizeTrace(leftTraceId, leftBlocks));
    }
    if (rightBlocks.length > 0 && rightTraceId) {
      promises.push(summarizeTrace(rightTraceId, rightBlocks));
    }

    if (promises.length === 0) {
      setIsSummarizationLoading(false);
    } else {
      Promise.all(promises)
        .catch((e) => console.error("Failed to prefetch block summaries:", e))
        .finally(() => setIsSummarizationLoading(false));
    }
  }, [
    leftTree,
    rightTree,
    maxTreeDepth,
    projectId,
    leftTraceId,
    rightTraceId,
    addBlockSummaries,
    setIsSummarizationLoading,
  ]);

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
