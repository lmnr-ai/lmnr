import { get } from "lodash";
import { AlertTriangle, FileText, ListFilter, Minus, Plus, Search, Sparkles } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// Copied local components
import List from "@/components/rollout-sessions/rollout-session-view/list";
import Minimap from "@/components/rollout-sessions/rollout-session-view/minimap.tsx";
import { 
  useRolloutSessionStoreContext,
  TraceViewSpan,
  TraceViewTrace,
  MAX_ZOOM,
  MIN_TREE_VIEW_WIDTH,
  MIN_ZOOM,
} from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import SystemMessagesSidebar from "@/components/rollout-sessions/rollout-session-view/system-messages-sidebar";
import { 
  createMessageVariant, 
  deleteMessageVariant,
  fetchSystemMessages, 
  updateMessageVariant 
} from "@/components/rollout-sessions/rollout-session-view/system-messages-utils";
import Timeline from "@/components/rollout-sessions/rollout-session-view/timeline";
import Tree from "@/components/rollout-sessions/rollout-session-view/tree";
import SessionPlayer from "@/components/traces/session-player";
import { SpanView } from "@/components/traces/span-view";
import Chat from "@/components/traces/trace-view/chat";
// Reused components from trace-view
import Header from "@/components/rollout-sessions/rollout-session-view/header";
import { HumanEvaluatorSpanView } from "@/components/traces/trace-view/human-evaluator-span-view";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view.tsx";
import Metadata from "@/components/traces/trace-view/metadata";
import { ScrollContextProvider } from "@/components/traces/trace-view/scroll-context";
import SearchTraceSpansInput from "@/components/traces/trace-view/search";
import {
  enrichSpansWithPending,
  filterColumns,
  findSpanToSelect,
} from "@/components/traces/trace-view/utils";
import ViewDropdown from "@/components/rollout-sessions/rollout-session-view/view-dropdown";
import { Button } from "@/components/ui/button.tsx";
import { StatefulFilter, StatefulFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { useFiltersContextProvider } from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { Skeleton } from "@/components/ui/skeleton";
import { Filter } from "@/lib/actions/common/filters";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils.ts";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";

interface RolloutSessionViewProps {
  sessionId: string;
  traceId: string;
  // Span id here to control span selection by spans table
  spanId?: string;
  propsTrace?: TraceViewTrace;
  onClose: () => void;
}

const PureRolloutSessionView = ({ sessionId, traceId, spanId, onClose, propsTrace }: RolloutSessionViewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useParams();

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

  // Local storage states
  const { treeWidth, spanPath, setSpanPath, setTreeWidth } = useRolloutSessionStoreContext((state) => ({
    treeWidth: state.treeWidth,
    setTreeWidth: state.setTreeWidth,
    spanPath: state.spanPath,
    setSpanPath: state.setSpanPath,
  }));

  const { value: filters, onChange: setFilters } = useFiltersContextProvider();
  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);
  const llmSpanIds = useMemo(
    () => spans.filter((span) => span.spanType === SpanType.LLM).map((span) => span.spanId),
    [spans]
  );

  // Rollout-specific state from store
  const {
    systemMessagesMap,
    setSystemMessagesMap,
    pathToCount,
    setPathToCount,
    pathSystemMessageOverrides,
    setPathSystemMessageOverrides,
    setCachePoint,
    isSpanCached,
    getLlmPathCounts,
  } = useRolloutSessionStoreContext((state) => ({
    systemMessagesMap: state.systemMessagesMap,
    setSystemMessagesMap: state.setSystemMessagesMap,
    pathToCount: state.pathToCount,
    setPathToCount: state.setPathToCount,
    pathSystemMessageOverrides: state.pathSystemMessageOverrides,
    setPathSystemMessageOverrides: state.setPathSystemMessageOverrides,
    setCachePoint: state.setCachePoint,
    isSpanCached: state.isSpanCached,
    getLlmPathCounts: state.getLlmPathCounts,
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

        // Add rollout session_id to span attributes
        // spans = spans.map((span) => ({
        //   ...span,
        //   attributes: {
        //     ...span.attributes,
        //     "lmnr.rollout.session_id": sessionId,
        //   },
        // }));

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

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("spanId");
    router.push(`${pathName}?${params.toString()}`);
    onClose();
  }, [onClose, pathName, router, searchParams]);

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

  // Rollout handlers
  const handleCreateVariant = useCallback((originalId: string, newContent: string) => {
    setSystemMessagesMap((prevMap) => {
      const { updatedMap } = createMessageVariant(prevMap, originalId, newContent);
      return updatedMap;
    });
  }, []);

  const handleUpdateVariant = useCallback((variantId: string, newContent: string) => {
    setSystemMessagesMap((prevMap) => updateMessageVariant(prevMap, variantId, newContent));
  }, []);

  const handleDeleteVariant = useCallback((variantId: string) => {
    setSystemMessagesMap((prevMap) => deleteMessageVariant(prevMap, variantId));
    // Also remove any path overrides using this variant
    setPathSystemMessageOverrides((prev) => {
      const newMap = new Map(prev);
      for (const [path, messageId] of newMap.entries()) {
        if (messageId === variantId) {
          newMap.delete(path);
        }
      }
      return newMap;
    });
  }, []);

  const handleRollout = useCallback(async () => {
    // Build the overrides object with path -> { system: "content" } structure
    const overrides: Record<string, { system: string; tools?: any[] }> = {};
    
    for (const [path, messageId] of pathSystemMessageOverrides.entries()) {
      const message = systemMessagesMap.get(messageId);
      if (message) {
        overrides[path] = {
          system: message.content,
          // tools can be added here if needed
        };
      }
    }

    const rolloutPayload = {
      trace_id: traceId,
      path_to_count: pathToCount,
      args: {
        // These will be filled by user in the future
        // instruction: "...",
        // temperature: 0.7,
      },
      overrides,
    };

    console.log("Rollout payload:", JSON.stringify(rolloutPayload, null, 2));
    // TODO: Send to backend API
    // const response = await fetch(`/api/projects/${projectId}/rollout`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(rolloutPayload),
    // });
  }, [pathToCount, systemMessagesMap, pathSystemMessageOverrides, traceId]);

  const handleSystemMessageOverride = useCallback((spanPath: string, messageId: string) => {
    setPathSystemMessageOverrides((prev) => {
      const newMap = new Map(prev);
      if (messageId === "") {
        newMap.delete(spanPath);
      } else {
        newMap.set(spanPath, messageId);
      }
      return newMap;
    });
  }, [setPathSystemMessageOverrides]);

  const isLoading = isTraceLoading && !trace;

  const eventHandlers = useMemo(
    () => ({
      span_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (payload.spans && Array.isArray(payload.spans)) {
          for (const incomingSpan of payload.spans) {
            addSpanIfNew(incomingSpan);
          }
        }
      },
    }),
    [addSpanIfNew]
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

  // Fetch system messages when trace is loaded
  useEffect(() => {
    if (!trace || !projectId || !traceId) return;

    const loadSystemMessages = async () => {
      try {
        const messages = await fetchSystemMessages(projectId, traceId);
        setSystemMessagesMap(messages);
      } catch (error) {
        console.error("Failed to fetch system messages:", error);
      }
    };

    loadSystemMessages();
  }, [trace, projectId, traceId]);

  // UPDATED REALTIME SUBSCRIPTION - using rollout_sessions_${sessionId}
  useRealtime({
    key: `rollout_sessions_${sessionId}`,
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
        <Header handleClose={handleClose} />
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
        {/* Header at the top */}
        <Header handleClose={handleClose} />
        
        {/* Main content area */}
        <div className="flex h-full w-full min-h-0">
          {/* Left sidebar - System messages and rollout controls */}
          <div className="flex-none w-96 border-r bg-background">
            <SystemMessagesSidebar
              systemMessages={systemMessagesMap}
              onCreateVariant={handleCreateVariant}
              onUpdateVariant={handleUpdateVariant}
              onDeleteVariant={handleDeleteVariant}
              onRollout={handleRollout}
              pathToCount={pathToCount}
            />
          </div>

          {/* Right area - Full span list with all tabs */}
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex flex-col gap-2 px-2 pb-2 border-b box-border">
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
                <Button
                  onClick={() => setTab("chat")}
                  variant="outline"
                  className={cn("h-6 text-xs px-1.5", {
                    "border-primary text-primary": tab === "chat",
                  })}
                >
                  <Sparkles size={14} className="mr-1" />
                  <span>Ask AI</span>
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

            {/* Search input */}
            {(search || searchEnabled) && (
              <SearchTraceSpansInput spans={spans} submit={fetchSpans} filters={filters} onAddFilter={handleAddFilter} />
            )}

            {/* Span list views */}
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
                  {tab === "chat" && trace && (
                    <Chat
                      trace={trace}
                      onSetSpanId={(spanId) => {
                        const span = spans.find((span) => span.spanId === spanId);
                        if (span) {
                          handleSpanSelect(span);
                        }
                      }}
                    />
                  )}
                  {tab === "timeline" && <Timeline />}
                {tab === "reader" && (
                  <div className="flex flex-1 h-full overflow-hidden relative">
                    <List 
                      traceId={traceId} 
                      onSpanSelect={handleSpanSelect}
                      onSetCachePoint={setCachePoint}
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
                        <Tree onSpanSelect={handleSpanSelect} />
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
          <SheetContent side="right" className="min-w-[50vw] w-[50vw] flex flex-col p-0">
            <SheetHeader className="px-6 py-4 border-b space-y-3">
              <div className="flex items-center justify-between">
                <SheetTitle>Span Details</SheetTitle>
              </div>
              {selectedSpan && selectedSpan.spanType === SpanType.LLM && systemMessagesMap.size > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Override System Message (applies to all spans on this path)
                  </label>
                  <select 
                    className="text-sm border rounded px-2 py-1.5 bg-background"
                    value={(() => {
                      const spanPath = selectedSpan.attributes?.["lmnr.span.path"];
                      if (!spanPath || !Array.isArray(spanPath)) return "";
                      return pathSystemMessageOverrides.get(spanPath.join(".")) || "";
                    })()}
                    onChange={(e) => {
                      const spanPath = selectedSpan.attributes?.["lmnr.span.path"];
                      if (spanPath && Array.isArray(spanPath)) {
                        handleSystemMessageOverride(spanPath.join("."), e.target.value);
                      }
                    }}
                  >
                    <option value="">Keep original</option>
                    {Array.from(systemMessagesMap.values()).map((msg) => (
                      <option key={msg.id} value={msg.id}>
                        {msg.name} {!msg.isOriginal && "(variant)"}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const spanPath = selectedSpan.attributes?.["lmnr.span.path"];
                    if (spanPath && Array.isArray(spanPath)) {
                      const pathKey = spanPath.join(".");
                      return (
                        <p className="text-xs text-muted-foreground">
                          Path: <code className="bg-muted px-1 py-0.5 rounded text-xs">{pathKey}</code>
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              {selectedSpan && (
                selectedSpan.spanType === SpanType.HUMAN_EVALUATOR ? (
                  <HumanEvaluatorSpanView
                    traceId={selectedSpan.traceId}
                    spanId={selectedSpan.spanId}
                    key={selectedSpan.spanId}
                  />
                ) : (
                  <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} traceId={traceId} />
                )
              )}
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
