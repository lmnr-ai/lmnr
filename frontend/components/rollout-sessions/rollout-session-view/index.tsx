import { get } from "lodash";
import { AlertTriangle, FileText, ListFilter, Minus, Plus, Search } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import Header from "@/components/rollout-sessions/rollout-session-view/header";
import List from "@/components/rollout-sessions/rollout-session-view/list";
import Minimap from "@/components/rollout-sessions/rollout-session-view/minimap.tsx";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  TraceViewSpan,
  TraceViewTrace,
  useRolloutSessionStoreContext,
} from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import SessionPlayer from "@/components/rollout-sessions/rollout-session-view/session-player";
import RolloutSidebar from "@/components/rollout-sessions/rollout-session-view/sidebar";
import { fetchSystemMessages } from "@/components/rollout-sessions/rollout-session-view/system-messages-utils";
import Timeline from "@/components/rollout-sessions/rollout-session-view/timeline";
import Tree from "@/components/rollout-sessions/rollout-session-view/tree";
import ViewDropdown from "@/components/rollout-sessions/rollout-session-view/view-dropdown";
import { SpanView } from "@/components/traces/span-view";
import { HumanEvaluatorSpanView } from "@/components/traces/trace-view/human-evaluator-span-view";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view.tsx";
import Metadata from "@/components/traces/trace-view/metadata";
import { ScrollContextProvider } from "@/components/traces/trace-view/scroll-context";
import SearchTraceSpansInput from "@/components/traces/trace-view/search";
import { enrichSpansWithPending, filterColumns } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button.tsx";
import { StatefulFilter, StatefulFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { useFiltersContextProvider } from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Filter } from "@/lib/actions/common/filters";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { useToast } from "@/lib/hooks/use-toast";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils.ts";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";

interface RolloutSessionViewProps {
  sessionId: string;
  traceId: string;
  spanId?: string;
  propsTrace?: TraceViewTrace;
}

const PureRolloutSessionView = ({ sessionId, traceId, spanId, propsTrace }: RolloutSessionViewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useParams();
  const { toast } = useToast();

  const [currentTraceId, setCurrentTraceId] = useState(traceId);
  const [isCancelling, setIsCancelling] = useState(false);

  // Data states
  const {
    selectedSpan,
    setSelectedSpan,
    spans,
    setSpans,
    trace,
    setTrace,
    isSpansLoading,
    isTraceLoading,
    setIsTraceLoading,
    setIsSpansLoading,
    traceError,
    setTraceError,
    spansError,
    setSpansError,
    rebuildSpanPathCounts,
    addSpanIfNew,
  } = useRolloutSessionStoreContext((state) => ({
    selectedSpan: state.selectedSpan,
    setSelectedSpan: state.setSelectedSpan,
    spans: state.spans,
    setSpans: state.setSpans,
    trace: state.trace,
    setTrace: state.setTrace,
    isTraceLoading: state.isTraceLoading,
    isSpansLoading: state.isSpansLoading,
    setIsSpansLoading: state.setIsSpansLoading,
    setIsTraceLoading: state.setIsTraceLoading,
    traceError: state.traceError,
    setTraceError: state.setTraceError,
    spansError: state.spansError,
    setSpansError: state.setSpansError,
    rebuildSpanPathCounts: state.rebuildSpanPathCounts,
    addSpanIfNew: state.addSpanIfNew,
  }));

  // UI states
  const {
    tab,
    setTab,
    search,
    setSearch,
    searchEnabled,
    setSearchEnabled,
    browserSession,
    setBrowserSession,
    zoom,
    handleZoom,
    langGraph,
    getHasLangGraph,
    hasBrowserSession,
    setHasBrowserSession,
  } = useRolloutSessionStoreContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    search: state.search,
    setSearch: state.setSearch,
    searchEnabled: state.searchEnabled,
    setSearchEnabled: state.setSearchEnabled,
    zoom: state.zoom,
    handleZoom: state.setZoom,
    browserSession: state.browserSession,
    setBrowserSession: state.setBrowserSession,
    setBrowserSessionTime: state.setSessionTime,
    langGraph: state.langGraph,
    getHasLangGraph: state.getHasLangGraph,
    hasBrowserSession: state.hasBrowserSession,
    setHasBrowserSession: state.setHasBrowserSession,
  }));

  const { setSpanPath } = useRolloutSessionStoreContext((state) => ({
    setSpanPath: state.setSpanPath,
  }));

  const { value: filters, onChange: setFilters } = useFiltersContextProvider();
  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);
  const llmSpanIds = useMemo(
    () =>
      spans
        .filter((span) => {
          if (span.spanType === SpanType.LLM) return true;
          if (span.spanType === SpanType.CACHED) {
            const originalType = span.attributes?.["lmnr.span.original_type"];
            return originalType === SpanType.LLM || originalType === "LLM";
          }
          return false;
        })
        .map((span) => span.spanId),
    [spans]
  );

  const {
    setSystemMessagesMap,
    setIsSystemMessagesLoading,
    pathToCount,
    getOverridesForRollout,
    setCachePoint,
    unlockFromSpan,
    isSpanCached,
    setIsRolloutRunning,
    setRolloutError,
    paramValues,
    setSessionStatus,
    removeNonCachedSpans,
  } = useRolloutSessionStoreContext((state) => ({
    setSystemMessagesMap: state.setSystemMessagesMap,
    setIsSystemMessagesLoading: state.setIsSystemMessagesLoading,
    pathToCount: state.pathToCount,
    getOverridesForRollout: state.getOverridesForRollout,
    setCachePoint: state.setCachePoint,
    unlockFromSpan: state.unlockFromSpan,
    isSpanCached: state.isSpanCached,
    setIsRolloutRunning: state.setIsRolloutRunning,
    setRolloutError: state.setRolloutError,
    paramValues: state.paramValues,
    setSessionStatus: state.setSessionStatus,
    removeNonCachedSpans: state.removeNonCachedSpans,
  }));

  const handleFetchTrace = useCallback(async () => {
    try {
      setIsTraceLoading(true);
      setTraceError(undefined);

      if (propsTrace) {
        return;
      } else {
        const response = await fetch(`/api/projects/${projectId}/traces/${traceId}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          const errorMessage = errorData.error || "Failed to load trace";

          setTraceError(errorMessage);
          return;
        }

        const traceData = (await response.json()) as TraceViewTrace;
        if (traceData.hasBrowserSession) {
          setHasBrowserSession(true);
          setBrowserSession(true);
        }
        setTrace(traceData);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to load trace. Please try again.";
      setTraceError(errorMessage);
    } finally {
      setIsTraceLoading(false);
    }
  }, [
    projectId,
    propsTrace,
    setBrowserSession,
    setHasBrowserSession,
    setIsTraceLoading,
    setTrace,
    setTraceError,
    traceId,
  ]);

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (!span) {
        setSelectedSpan(undefined);
        const params = new URLSearchParams(searchParams);
        params.delete("spanId");
        router.replace(`${pathName}?${params.toString()}`);
        return;
      }

      setSelectedSpan(span);

      const spanPath = span.attributes?.["lmnr.span.path"];
      if (spanPath && Array.isArray(spanPath)) {
        setSpanPath(spanPath);
      }

      const currentSpanId = searchParams.get("spanId");
      if (currentSpanId !== span.spanId) {
        const params = new URLSearchParams(searchParams);
        params.set("spanId", span.spanId);
        router.replace(`${pathName}?${params.toString()}`);
      }
    },
    [setSelectedSpan, searchParams, setSpanPath, router, pathName]
  );

  const fetchSpans = useCallback(
    async (search: string, filters: Filter[]) => {
      try {
        setIsSpansLoading(true);
        setSpansError(undefined);

        const params = new URLSearchParams();
        if (search) {
          params.set("search", search);
        }
        params.append("searchIn", "input");
        params.append("searchIn", "output");

        filters.forEach((filter) => params.append("filter", JSON.stringify(filter)));

        if (trace) {
          const startDate = new Date(new Date(trace.startTime).getTime() - 1000);
          const endDate = new Date(new Date(trace.endTime).getTime() + 1000);
          params.set("startDate", startDate.toISOString());
          params.set("endDate", endDate.toISOString());
        }

        const url = `/api/projects/${projectId}/traces/${traceId}/spans?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          const errorMessage = errorData.error || "Failed to load spans";

          setSpansError(errorMessage);
          return;
        }

        const results = (await response.json()) as TraceViewSpan[];
        let spans = search || filters?.length > 0 ? results : enrichSpansWithPending(results);

        setSpans(spans);

        // Rebuild the span path counts map for efficient realtime updates
        rebuildSpanPathCounts();

        if (spans.some((s) => Boolean(get(s.attributes, "lmnr.internal.has_browser_session"))) && !hasBrowserSession) {
          setHasBrowserSession(true);
          setBrowserSession(true);
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Failed to load spans";
        setSpansError(errorMessage);

        console.error(e);
      } finally {
        setIsSpansLoading(false);
      }
    },
    [
      trace,
      setIsSpansLoading,
      setSpansError,
      projectId,
      traceId,
      setSpans,
      hasBrowserSession,
      setHasBrowserSession,
      setBrowserSession,
      setSelectedSpan,
    ]
  );

  const handleToggleSearch = useCallback(async () => {
    if (searchEnabled) {
      setSearchEnabled(false);
      setSearch("");
      if (search !== "") {
        await fetchSpans("", filters);
      }
    } else {
      setSearchEnabled(true);
    }
  }, [searchEnabled, setSearchEnabled, setSearch, search, fetchSpans, filters]);

  const handleAddFilter = useCallback(
    (filter: Filter) => {
      setFilters((prevFilters) => [...prevFilters, filter]);
    },
    [setFilters]
  );

  const handleRollout = useCallback(async () => {
    try {
      setIsRolloutRunning(true);
      setRolloutError(undefined);

      removeNonCachedSpans();
      const overrides = getOverridesForRollout();

      const rolloutPayload = {
        trace_id: currentTraceId,
        path_to_count: pathToCount,
        args: paramValues,
        overrides,
      };

      const response = await fetch(`/api/projects/${projectId}/rollouts/${sessionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rolloutPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to run rollout");
      }

      await response.json();

      setSessionStatus("RUNNING");

      toast({
        title: "Rollout started successfully",
        description: "The rollout is now running with your configuration.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to run rollout";
      setRolloutError(errorMessage);
      toast({
        title: "Failed to run rollout",
        description: errorMessage,
        variant: "destructive",
      });
      console.error("Rollout error:", error);
    } finally {
      setIsRolloutRunning(false);
    }
  }, [
    pathToCount,
    getOverridesForRollout,
    currentTraceId,
    sessionId,
    setIsRolloutRunning,
    setRolloutError,
    setSessionStatus,
    removeNonCachedSpans,
    toast,
    projectId,
    paramValues,
  ]);

  const handleCancel = useCallback(async () => {
    try {
      setIsCancelling(true);
      const response = await fetch(`/api/projects/${projectId}/rollouts/${sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "STOPPED" }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to cancel rollout");
      }

      setSessionStatus("STOPPED");

      toast({
        title: "Rollout cancelled",
        description: "The rollout session has been stopped.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to cancel rollout";
      toast({
        title: "Failed to cancel rollout",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  }, [projectId, sessionId, setSessionStatus, toast]);

  const isLoading = isTraceLoading && !trace;

  const eventHandlers = useMemo(
    () => ({
      span_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (payload.spans && Array.isArray(payload.spans)) {
          for (const incomingSpan of payload.spans) {
            addSpanIfNew(incomingSpan);
            // Update the current traceId from the incoming span
            if (incomingSpan.traceId) {
              setCurrentTraceId(incomingSpan.traceId);
            }
          }
        }
      },
      status_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (payload.status) {
          setSessionStatus(payload.status);
        }
      },
    }),
    [addSpanIfNew, setSessionStatus]
  );

  useEffect(() => {
    if (!isSpansLoading) {
      const span = spans?.find((s) => s.spanId === spanId);
      if (spanId && span) {
        setSelectedSpan(span);
      }
    }
  }, [isSpansLoading, setSelectedSpan, spanId, spans]);

  useEffect(() => {
    handleFetchTrace();
  }, [handleFetchTrace]);

  useLayoutEffect(() => {
    const urlSearch = searchParams.get("search");
    if (urlSearch) {
      setSearch(urlSearch);
      setSearchEnabled(true);
    }
  }, []);

  useEffect(() => {
    fetchSpans(search, filters);

    return () => {
      setSpans([]);
      setTraceError(undefined);
      setSpansError(undefined);
    };
  }, [traceId, projectId, filters, setSpans, setTraceError, setSpansError]);

  useEffect(() => {
    if (!projectId || !traceId || spans.length === 0) return;

    const llmPaths = new Set<string>();
    for (const span of spans) {
      const isLlm = span.spanType === SpanType.LLM;
      if (isLlm && span.path) {
        llmPaths.add(span.path);
      }
    }

    if (llmPaths.size === 0) return;

    const loadSystemMessages = async () => {
      setIsSystemMessagesLoading(true);
      try {
        const messages = await fetchSystemMessages(projectId as string, traceId, Array.from(llmPaths));
        setSystemMessagesMap(messages);
      } catch (error) {
        console.error("Failed to fetch system messages:", error);
      } finally {
        setIsSystemMessagesLoading(false);
      }
    };

    loadSystemMessages();
  }, [traceId, spans]);

  useRealtime({
    key: `rollout_session_${sessionId}`,
    projectId: projectId as string,
    enabled: !!sessionId && !!projectId,
    eventHandlers,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <div className="flex items-center gap-x-2 p-2 border-b h-12">
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex flex-col p-2 gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (traceError) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <Header />
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="max-w-md mx-auto">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-destructive mb-4">Error Loading Trace</h3>
            <p className="text-sm text-muted-foreground">{traceError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScrollContextProvider>
      <div className="flex flex-col h-full w-full">
        <Header />
        <div className="flex h-full w-full min-h-0">
          <div className="flex-none w-96 border-r bg-background flex flex-col">
            <RolloutSidebar onRollout={handleRollout} onCancel={handleCancel} isCancelling={isCancelling} />
          </div>

          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex flex-col gap-2 p-2 border-b box-border">
              <div className="flex items-center gap-2 flex-nowrap w-full overflow-x-auto no-scrollbar">
                <ViewDropdown />
                <StatefulFilter columns={filterColumns}>
                  <Button variant="outline" className="h-6 text-xs">
                    <ListFilter size={14} className="mr-1" />
                    Filters
                  </Button>
                </StatefulFilter>
                <Button
                  onClick={handleToggleSearch}
                  variant="outline"
                  className={cn("h-6 text-xs px-1.5", {
                    "border-primary text-primary": search || searchEnabled,
                  })}
                >
                  <Search size={14} className="mr-1" />
                  <span>Search</span>
                </Button>
                <Button
                  onClick={() => setTab("metadata")}
                  variant="outline"
                  className={cn("h-6 text-xs px-1.5", {
                    "border-primary text-primary": tab === "metadata",
                  })}
                >
                  <FileText size={14} className="mr-1" />
                  <span>Metadata</span>
                </Button>
                {tab === "timeline" && (
                  <>
                    <Button
                      disabled={zoom === MAX_ZOOM}
                      className="size-6 min-w-6 ml-auto"
                      variant="outline"
                      size="icon"
                      onClick={() => handleZoom("in")}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    <Button
                      disabled={zoom === MIN_ZOOM}
                      className="size-6 min-w-6"
                      variant="outline"
                      size="icon"
                      onClick={() => handleZoom("out")}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
              <StatefulFilterList className="py-[3px] text-xs px-1" />
            </div>

            {(search || searchEnabled) && (
              <SearchTraceSpansInput
                spans={spans}
                submit={fetchSpans}
                filters={filters}
                onAddFilter={handleAddFilter}
              />
            )}

            {spansError ? (
              <div className="flex flex-col items-center justify-center flex-1 p-4 text-center">
                <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
                <h4 className="text-sm font-semibold text-destructive mb-2">Error Loading Spans</h4>
                <p className="text-xs text-muted-foreground">{spansError}</p>
              </div>
            ) : (
              <ResizablePanelGroup id="rollout-session-view-panels" direction="vertical">
                <ResizablePanel className="flex flex-col flex-1 h-full overflow-hidden relative">
                  {tab === "metadata" && trace && <Metadata trace={trace} />}
                  {tab === "timeline" && (
                    <Timeline onSetCachePoint={setCachePoint} onUnlock={unlockFromSpan} isSpanCached={isSpanCached} />
                  )}
                  {tab === "reader" && (
                    <div className="flex flex-1 h-full overflow-hidden relative">
                      <List
                        traceId={traceId}
                        onSpanSelect={handleSpanSelect}
                        onSetCachePoint={setCachePoint}
                        onUnlock={unlockFromSpan}
                        isSpanCached={isSpanCached}
                      />
                      <Minimap onSpanSelect={handleSpanSelect} />
                    </div>
                  )}
                  {tab === "tree" &&
                    (isSpansLoading ? (
                      <div className="flex flex-col gap-2 p-2 pb-4 w-full min-w-full">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ) : (
                      <div className="flex flex-1 h-full overflow-hidden relative">
                        <Tree
                          onSpanSelect={handleSpanSelect}
                          onSetCachePoint={setCachePoint}
                          onUnlock={unlockFromSpan}
                          isSpanCached={isSpanCached}
                        />
                        <Minimap onSpanSelect={handleSpanSelect} />
                      </div>
                    ))}
                </ResizablePanel>
                {browserSession && (
                  <>
                    <ResizableHandle className="z-50" withHandle />
                    <ResizablePanel>
                      {!isLoading && (
                        <SessionPlayer
                          onClose={() => setBrowserSession(false)}
                          hasBrowserSession={hasBrowserSession}
                          traceId={traceId}
                          llmSpanIds={llmSpanIds}
                        />
                      )}
                    </ResizablePanel>
                  </>
                )}
                {langGraph && hasLangGraph && <LangGraphView spans={spans} />}
              </ResizablePanelGroup>
            )}
          </div>
        </div>

        <Sheet open={!!selectedSpan} onOpenChange={(open) => !open && handleSpanSelect(undefined)}>
          <SheetContent side="right" className="min-w-[50vw] w-[50vw] flex flex-col p-0 gap-0">
            <SheetHeader className="hidden">
              <SheetTitle />
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              {selectedSpan &&
                (selectedSpan.spanType === SpanType.HUMAN_EVALUATOR ? (
                  <HumanEvaluatorSpanView
                    traceId={selectedSpan.traceId}
                    spanId={selectedSpan.spanId}
                    key={selectedSpan.spanId}
                  />
                ) : (
                  <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} traceId={currentTraceId} />
                ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </ScrollContextProvider>
  );
};

export default function RolloutSessionView(props: RolloutSessionViewProps) {
  return <PureRolloutSessionView {...props} />;
}
