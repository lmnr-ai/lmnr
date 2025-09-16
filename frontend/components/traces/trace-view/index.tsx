import { ChartNoAxesGantt, ListFilter, MessageCircle, Minus, Plus, Search } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

import Header from "@/components/traces/trace-view/header";
import { HumanEvaluatorSpanView } from "@/components/traces/trace-view/human-evaluator-span-view";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view";
import Minimap from "@/components/traces/trace-view/minimap.tsx";
import SearchSpansInput from "@/components/traces/trace-view/search-spans-input.tsx";
import TraceViewStoreProvider, {
  MAX_ZOOM,
  MIN_TREE_VIEW_WIDTH,
  MIN_ZOOM,
  TraceViewSpan,
  useTraceViewStoreContext,
} from "@/components/traces/trace-view/trace-view-store.tsx";
import {
  enrichSpansWithPending,
  filterColumns,
  findSpanToSelect,
  onRealtimeUpdateSpans,
} from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button.tsx";
import { StatefulFilter, StatefulFilterList } from "@/components/ui/datatable-filter";
import { useFiltersContextProvider } from "@/components/ui/datatable-filter/context";
import { DatatableFilter } from "@/components/ui/datatable-filter/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { SpanType, Trace } from "@/lib/traces/types";
import { cn } from "@/lib/utils.ts";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";
import SessionPlayer, { SessionPlayerHandle } from "../session-player";
import { SpanView } from "../span-view";
import Chat from "./chat";
import { ScrollContextProvider } from "./scroll-context";
import Timeline from "./timeline";
import Tree from "./tree";

interface TraceViewProps {
  traceId: string;
  // Span id here to control span selection by spans table
  spanId?: string;
  propsTrace?: Trace;
  onClose: () => void;
}

const PureTraceView = ({ traceId, spanId, onClose, propsTrace }: TraceViewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useParams();
  const { toast } = useToast();

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
  } = useTraceViewStoreContext((state) => ({
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
    setBrowserSessionTime,
    langGraph,
    getHasLangGraph,
  } = useTraceViewStoreContext((state) => ({
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
  }));

  // Local storage states
  const { treeWidth, spanPath, setSpanPath, setTreeWidth } = useTraceViewStoreContext((state) => ({
    treeWidth: state.treeWidth,
    setTreeWidth: state.setTreeWidth,
    spanPath: state.spanPath,
    setSpanPath: state.setSpanPath,
  }));

  const { value: filters } = useFiltersContextProvider();
  const { supabaseClient: supabase } = useUserContext();
  const browserSessionRef = useRef<SessionPlayerHandle>(null);

  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);

  const handleFetchTrace = useCallback(async () => {
    try {
      setIsTraceLoading(true);
      if (propsTrace) {
        setTrace(propsTrace);
      } else {
        const response = await fetch(`/api/projects/${projectId}/traces/${traceId}`);
        if (!response.ok) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to load trace. Please try again.",
          });
          return;
        }
        const traceData = (await response.json()) as Trace;
        setTrace(traceData);
        if (traceData.hasBrowserSession) {
          setBrowserSession(true);
        }
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load trace. Please try again.",
      });
    } finally {
      setIsTraceLoading(false);
    }
  }, [projectId, propsTrace, setBrowserSession, setIsTraceLoading, setTrace, toast, traceId]);

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (!span) return;

      setSelectedSpan(span);

      const spanPath = span.attributes?.["lmnr.span.path"];
      if (spanPath && Array.isArray(spanPath)) {
        setSpanPath(spanPath);
      }

      const currentSpanId = searchParams.get("spanId");
      if (currentSpanId !== span.spanId) {
        const params = new URLSearchParams(searchParams);
        params.set("spanId", span.spanId);
        router.push(`${pathName}?${params.toString()}`);
      }
    },
    [setSelectedSpan, searchParams, setSpanPath, router, pathName]
  );

  const fetchSpans = useCallback(
    async (search: string, searchIn: string[], filters: DatatableFilter[]) => {
      try {
        setIsSpansLoading(true);

        const params = new URLSearchParams();
        if (search) {
          params.set("search", search);
        }
        searchIn.forEach((val) => params.append("searchIn", val));
        filters.forEach((filter) => params.append("filter", JSON.stringify(filter)));

        setSearch(search);
        if (search) {
          setSearchEnabled(true);
        }

        const url = `/api/projects/${projectId}/traces/${traceId}/spans?${params.toString()}`;
        const response = await fetch(url);
        const results = await response.json();
        const spans = enrichSpansWithPending(results);

        setSpans(spans);

        if (spans.length > 0) {
          const selectedSpan = findSpanToSelect(spans, spanId, searchParams, spanPath);
          setSelectedSpan(selectedSpan);
        } else {
          setSelectedSpan(undefined);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSpansLoading(false);
      }
    },
    [setIsSpansLoading, projectId, traceId, setSpans, setSearch, spanId, searchParams, spanPath, setSelectedSpan]
  );

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("spanId");
    router.push(`${pathName}?${params.toString()}`);
    onClose();
  }, [onClose, pathName, router, searchParams]);

  const handleResizeTreeView = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = treeWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(MIN_TREE_VIEW_WIDTH, startWidth + moveEvent.clientX - startX);
        setTreeWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [setTreeWidth, treeWidth]
  );

  const handleToggleSearch = useCallback(() => {
    if (searchEnabled) {
      if (search !== "") {
        fetchSpans("", ["input", "output"], []);
      }
      setSearch("");
    }
    setSearchEnabled(!searchEnabled);
  }, [fetchSpans, searchEnabled, setSearch, setSearchEnabled, search]);

  const isLoading = !trace || (isSpansLoading && isTraceLoading);

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
  }, [handleFetchTrace, projectId, traceId]);

  useEffect(() => {
    const search = searchParams.get("search") || "";
    const searchIn = searchParams.getAll("searchIn");

    fetchSpans(search, searchIn, filters);

    return () => {
      setSpans([]);
      setBrowserSession(false);
      setSearch("");
      setSearchEnabled(false);
    };
  }, [traceId, projectId, filters, setSpans, setBrowserSession, setSearch, setSearchEnabled]);

  useEffect(() => {
    if (!supabase || !traceId) {
      return;
    }
    // Clean up
    supabase.channel(`trace-updates-${traceId}`).unsubscribe();

    const channel = supabase
      .channel(`trace-updates-${traceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "spans",
          filter: `trace_id=eq.${traceId}`,
        },
        onRealtimeUpdateSpans(spans, setSpans, setTrace, setBrowserSession, trace)
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [setBrowserSession, setSpans, setTrace, spans, supabase, trace, traceId]);

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

  return (
    <ScrollContextProvider>
      <div className="flex flex-col h-full w-full overflow-hidden">
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel className="flex size-full">
            <div className="flex h-full flex-col flex-none relative" style={{ width: treeWidth }}>
              <Header handleClose={handleClose} handleFetchTrace={handleFetchTrace} />
              <div className="flex flex-col gap-1 px-2 py-2 border-b box-border">
                <div className="flex items-center gap-2">
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
                    onClick={() => setTab("timeline")}
                    variant="outline"
                    className={cn("h-6 text-xs px-1.5", {
                      "border-primary text-primary": tab === "timeline",
                    })}
                  >
                    <ChartNoAxesGantt size={14} className="mr-1" />
                    <span>Timeline</span>
                  </Button>
                  <Button
                    onClick={() => setTab("chat")}
                    variant="outline"
                    className={cn("h-6 text-xs px-1.5", {
                      "border-primary text-primary": tab === "chat",
                    })}
                  >
                    <MessageCircle size={14} className="mr-1" />
                    <span>Chat</span>
                  </Button>
                  {tab === "timeline" && (
                    <>
                      <Button
                        disabled={zoom === MAX_ZOOM}
                        className="h-6 w-6 ml-auto"
                        variant="outline"
                        size="icon"
                        onClick={() => handleZoom("in")}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button
                        disabled={zoom === MIN_ZOOM}
                        className="h-6 w-6"
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
                <SearchSpansInput
                  submit={fetchSpans}
                  filterBoxClassName="top-10"
                  className="rounded-none w-full border-0 border-b ring-0 bg-background"
                />
              )}
              <>
                {tab === "chat" && (
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
                <>
                  {tab === "timeline" && <Timeline />}
                  {tab === "tree" &&
                    (isSpansLoading ? (
                      <div className="flex flex-col gap-2 p-2 pb-4 w-full min-w-full">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ) : (
                      <div className="flex flex-1 overflow-hidden relative">
                        <Tree onSpanSelect={handleSpanSelect} />
                        <Minimap onSpanSelect={handleSpanSelect} />
                      </div>
                    ))}
                </>
              </>
              <div
                className="absolute top-0 right-0 h-full cursor-col-resize z-50 group w-2"
                onMouseDown={handleResizeTreeView}
              >
                <div className="absolute top-0 right-0 h-full w-px bg-border group-hover:w-1 group-hover:bg-blue-400 transition-colors" />
              </div>
            </div>
            <div className="flex-grow overflow-hidden flex-wrap">
              {isSpansLoading ? (
                <div className="flex flex-col space-y-2 p-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : selectedSpan ? (
                selectedSpan.spanType === SpanType.HUMAN_EVALUATOR ? (
                  <HumanEvaluatorSpanView spanId={selectedSpan.spanId} key={selectedSpan.spanId} />
                ) : (
                  <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} />
                )
              ) : (
                <div className="flex flex-col items-center justify-center size-full text-muted-foreground">
                  <span className="text-xl font-medium mb-2">No span selected</span>
                  <span className="text-base">Select a span from the trace tree to view its details</span>
                </div>
              )}
            </div>
          </ResizablePanel>
          {browserSession && (
            <>
              <ResizableHandle className="z-50" withHandle />
              <ResizablePanel>
                {!isLoading && (
                  <SessionPlayer
                    ref={browserSessionRef}
                    hasBrowserSession={trace.hasBrowserSession}
                    traceId={traceId}
                    onTimelineChange={setBrowserSessionTime}
                  />
                )}
              </ResizablePanel>
            </>
          )}
          {langGraph && hasLangGraph && <LangGraphView spans={spans} />}
        </ResizablePanelGroup>
      </div>
    </ScrollContextProvider>
  );
};

export default function TraceView(props: TraceViewProps) {
  return (
    <TraceViewStoreProvider>
      <PureTraceView {...props} />
    </TraceViewStoreProvider>
  );
}
