import { get } from "lodash";
import { AlertTriangle, CirclePlay } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TraceStatsShields } from "@/components/traces/stats-shields";
import Header from "@/components/traces/trace-view/header";
import { HumanEvaluatorSpanView } from "@/components/traces/trace-view/human-evaluator-span-view";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view.tsx";
import LangGraphViewTrigger from "@/components/traces/trace-view/lang-graph-view-trigger";
import SignalLensBanner from "@/components/traces/trace-view/signal-lens-banner";
import TraceViewStoreProvider, {
  MIN_TREE_VIEW_WIDTH,
  type TraceViewSpan,
  type TraceViewTrace,
  useTraceViewStore,
} from "@/components/traces/trace-view/store";
import { enrichSpansWithPending, findSpanToSelect, onRealtimeUpdateSpans } from "@/components/traces/trace-view/utils";
import ViewDropdown from "@/components/traces/trace-view/view-dropdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type Filter } from "@/lib/actions/common/filters";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";
import SessionPlayer from "../session-player";
import { SpanView } from "../span-view";
import Chat from "./chat";
import CondensedTimeline from "./condensed-timeline";
import List from "./list";
import { ScrollContextProvider } from "./scroll-context";
import Tree from "./tree";

// Regex to extract spanId values from Laminar trace URLs embedded in payload text.
// Matches ?spanId=<uuid> or &spanId=<uuid> patterns.
const SPAN_ID_URL_PATTERN = /[?&]spanId=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/**
 * Extract significant span IDs from a signal event payload.
 * Supports:
 * 1. Explicit arrays: payload.significant_spans or payload.significantSpans
 * 2. URL links: spanId query params in Laminar trace URLs found in string values
 */
function extractSignificantSpanIds(payload: Record<string, unknown>): Set<string> {
  // Check for explicit arrays first
  const explicitIds = (payload?.significant_spans ?? payload?.significantSpans) as string[] | undefined;
  if (Array.isArray(explicitIds) && explicitIds.length > 0) {
    return new Set(explicitIds);
  }

  // Scan all string values in the payload for trace URLs containing spanId
  const ids = new Set<string>();
  const payloadStr = JSON.stringify(payload);
  let match;
  while ((match = SPAN_ID_URL_PATTERN.exec(payloadStr)) !== null) {
    ids.add(match[1]);
  }

  return ids;
}

interface TraceViewProps {
  traceId: string;
  spanId?: string;
  propsTrace?: TraceViewTrace;
  onClose: () => void;
}

const PureTraceView = ({ traceId, spanId, onClose, propsTrace }: TraceViewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useParams();
  const [chatOpen, setChatOpen] = useState(false);

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
  } = useTraceViewStore((state) => ({
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
  }));

  // UI states
  const {
    tab,
    browserSession,
    setBrowserSession,
    langGraph,
    setLangGraph,
    getHasLangGraph,
    hasBrowserSession,
    setHasBrowserSession,
    condensedTimelineEnabled,
    condensedTimelineVisibleSpanIds,
  } = useTraceViewStore((state) => ({
    tab: state.tab,
    browserSession: state.browserSession,
    setBrowserSession: state.setBrowserSession,
    langGraph: state.langGraph,
    setLangGraph: state.setLangGraph,
    getHasLangGraph: state.getHasLangGraph,
    hasBrowserSession: state.hasBrowserSession,
    setHasBrowserSession: state.setHasBrowserSession,
    condensedTimelineEnabled: state.condensedTimelineEnabled,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
  }));

  // Signal lens states
  const { signalLensActive, setSignalLens, dismissSignalLens, setActiveChipSpanId, selectSpanById } = useTraceViewStore(
    (state) => ({
      signalLensActive: state.signalLensActive,
      setSignalLens: state.setSignalLens,
      dismissSignalLens: state.dismissSignalLens,
      setActiveChipSpanId: state.setActiveChipSpanId,
      selectSpanById: state.selectSpanById,
    })
  );

  // Local storage states
  const { treeWidth, spanPath, setSpanPath, setTreeWidth } = useTraceViewStore((state) => ({
    treeWidth: state.treeWidth,
    setTreeWidth: state.setTreeWidth,
    spanPath: state.spanPath,
    setSpanPath: state.setSpanPath,
  }));

  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);
  const filteredSpansForStats = useMemo(() => {
    if (condensedTimelineVisibleSpanIds.size === 0) return undefined;
    return spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));
  }, [spans, condensedTimelineVisibleSpanIds]);
  const llmSpanIds = useMemo(
    () => spans.filter((span) => span.spanType === SpanType.LLM).map((span) => span.spanId),
    [spans]
  );

  const handleFetchTrace = useCallback(async () => {
    if (propsTrace) {
      return;
    }

    try {
      setIsTraceLoading(true);
      setTraceError(undefined);

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
        const spans = search || filters?.length > 0 ? results : enrichSpansWithPending(results);

        setSpans(spans);

        if (spans.some((s) => Boolean(get(s.attributes, "lmnr.internal.has_browser_session"))) && !hasBrowserSession) {
          setHasBrowserSession(true);
          setBrowserSession(true);
        }

        if (spans.length > 0) {
          const selectedSpan = findSpanToSelect(spans, spanId, searchParams, spanPath);
          setSelectedSpan(selectedSpan);
        } else {
          setSelectedSpan(undefined);
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
    params.delete("signalEventId");
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

  const isLoading = isTraceLoading && !trace;

  const eventHandlers = useMemo(
    () => ({
      span_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (payload.spans && Array.isArray(payload.spans)) {
          for (const span of payload.spans) {
            onRealtimeUpdateSpans(setSpans, setTrace, setBrowserSession)(span);
          }
        }
      },
    }),
    [setBrowserSession, setSpans, setTrace]
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

  useEffect(() => {
    fetchSpans("", []);

    return () => {
      setSpans([]);
      setTraceError(undefined);
      setSpansError(undefined);
    };
  }, [traceId, projectId, setSpans, setTraceError, setSpansError]);

  useRealtime({
    key: `trace_${traceId}`,
    projectId: projectId as string,
    enabled: !!traceId && !!projectId,
    eventHandlers,
  });

  // Signal lens: fetch signal event data when signalEventId is in URL
  const signalEventIdParam = searchParams.get("signalEventId");
  const lastInitializedSignalEventId = useRef<string | null>(null);
  const signalLensDismissed = useRef(false);

  // Wait until spans have actually loaded (spans.length > 0 and not loading)
  // before initializing signal lens, so the banner can match span IDs correctly.
  const spansReady = spans.length > 0 && !isSpansLoading;

  // When the signalEventId param is removed from the URL (via dismiss, browser
  // navigation, or any other means), clean up both the store state and the local
  // refs so the banner disappears and future navigations can re-initialize.
  useEffect(() => {
    if (!signalEventIdParam) {
      dismissSignalLens();
      signalLensDismissed.current = false;
      lastInitializedSignalEventId.current = null;
    }
  }, [signalEventIdParam, dismissSignalLens]);

  useEffect(() => {
    if (
      !signalEventIdParam ||
      !projectId ||
      !spansReady ||
      signalLensDismissed.current ||
      lastInitializedSignalEventId.current === signalEventIdParam
    )
      return;
    lastInitializedSignalEventId.current = signalEventIdParam;

    const fetchSignalEvent = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/signal-events/${signalEventIdParam}`);
        if (!response.ok) return;

        const event = await response.json();
        const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;

        // Extract significant span IDs from the payload.
        // Span IDs can be in explicit arrays or embedded as URL links in string values.
        const significantSpanIds = extractSignificantSpanIds(payload);

        setSignalLens({
          signalEventId: signalEventIdParam,
          signalName: event.name || "Signal",
          signalPayload: payload,
          significantSpanIds,
        });
      } catch {
        // Silently fail — signal lens is optional enhancement
      }
    };

    fetchSignalEvent();
  }, [signalEventIdParam, projectId, spansReady, setSignalLens]);

  // Signal lens dismiss handler — uses router.replace to keep searchParams in sync.
  // Sets dismissed flag to prevent the effect from re-triggering while router.replace
  // asynchronously removes the URL param.
  const handleSignalLensDismiss = useCallback(() => {
    signalLensDismissed.current = true;
    const params = new URLSearchParams(searchParams);
    params.delete("signalEventId");
    router.replace(`${pathName}?${params.toString()}`);
  }, [searchParams, router, pathName]);

  // Signal lens chip click handler
  const handleSignalLensChipClick = useCallback(
    (spanId: string) => {
      setActiveChipSpanId(spanId);
      selectSpanById(spanId);

      // Scroll to span in tree/list and flash it.
      // The virtualizer may not have rendered the element yet (off-screen spans
      // don't exist in the DOM), so retry until it appears after the virtualizer
      // scrolls it into view.
      let attempts = 0;
      const maxAttempts = 10;
      const tryFlash = () => {
        const el = document.querySelector(`[data-span-id="${spanId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.remove("signal-lens-flash");
          void (el as HTMLElement).offsetWidth;
          el.classList.add("signal-lens-flash");
        } else if (++attempts < maxAttempts) {
          requestAnimationFrame(tryFlash);
        }
      };
      requestAnimationFrame(tryFlash);
    },
    [setActiveChipSpanId, selectSpanById]
  );

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
        <Header
          handleClose={handleClose}
          chatOpen={chatOpen}
          setChatOpen={setChatOpen}
          spans={[]}
          onSearch={() => {}}
        />
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
        {signalLensActive && (
          <SignalLensBanner onChipClick={handleSignalLensChipClick} onDismiss={handleSignalLensDismiss} />
        )}
        <div className="flex flex-1 min-h-0 w-full">
          <div className="flex h-full flex-col flex-none relative" style={{ width: treeWidth }}>
            <Header
              handleClose={handleClose}
              chatOpen={chatOpen}
              setChatOpen={setChatOpen}
              spans={spans}
              onSearch={(filters, search) => fetchSpans(search, filters)}
            />

            {spansError ? (
              <div className="flex flex-col items-center justify-center flex-1 p-4 text-center">
                <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
                <h4 className="text-sm font-semibold text-destructive mb-2">Error Loading Spans</h4>
                <p className="text-xs text-muted-foreground">{spansError}</p>
              </div>
            ) : chatOpen ? (
              // Ask AI takes over entire view
              trace && (
                <Chat
                  trace={trace}
                  onSearchSpans={(search) => {
                    fetchSpans(search, []);
                  }}
                  onSetSpanId={(spanId) => {
                    const span = spans.find((span) => span.spanId === spanId);
                    if (span) {
                      handleSpanSelect(span);
                    }
                  }}
                />
              )
            ) : (
              <ResizablePanelGroup id="trace-view-panels" orientation="vertical">
                {condensedTimelineEnabled && (
                  <>
                    <ResizablePanel defaultSize={120} minSize={80}>
                      <div className="border-t h-full">
                        <CondensedTimeline />
                      </div>
                    </ResizablePanel>
                    <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors hover:scale-200" />
                  </>
                )}
                <ResizablePanel className="flex flex-col flex-1 h-full overflow-hidden relative">
                  <div
                    className={cn(
                      "flex items-center gap-2 pb-2 border-b box-border transition-[padding] duration-200",
                      condensedTimelineEnabled ? "pt-2 pl-2 pr-2" : "pt-0 pl-2 pr-[96px]"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <ViewDropdown />
                        {trace && (
                          <TraceStatsShields
                            className="min-w-0 overflow-hidden"
                            trace={trace}
                            spans={filteredSpansForStats}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          disabled={!trace}
                          className={cn("h-6 px-1.5 text-xs", {
                            "border-primary text-primary": browserSession,
                          })}
                          variant="outline"
                          onClick={() => setBrowserSession(!browserSession)}
                        >
                          <CirclePlay size={14} className="mr-1" />
                          Media
                        </Button>
                        {hasLangGraph && <LangGraphViewTrigger setOpen={setLangGraph} open={langGraph} />}
                      </div>
                    </div>
                  </div>
                  {tab === "reader" && (
                    <div className="flex flex-1 h-full overflow-hidden relative">
                      <List onSpanSelect={handleSpanSelect} />
                    </div>
                  )}
                  {tab === "tree" && (
                    <div className="flex flex-1 h-full overflow-hidden relative">
                      <Tree onSpanSelect={handleSpanSelect} />
                    </div>
                  )}
                </ResizablePanel>
                {browserSession && (
                  <>
                    <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors hover:scale-200" />
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
            <div
              className="absolute top-0 right-0 h-full cursor-col-resize z-50 group w-2"
              onMouseDown={handleResizeTreeView}
            >
              <div className="absolute top-0 right-0 h-full w-px bg-border group-hover:w-0.5 group-hover:bg-blue-400 transition-colors" />
            </div>
          </div>
          <div className="grow overflow-hidden flex-wrap h-full w-full">
            {isSpansLoading ? (
              <div className="flex flex-col space-y-2 p-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : selectedSpan ? (
              selectedSpan.spanType === SpanType.HUMAN_EVALUATOR ? (
                <HumanEvaluatorSpanView
                  traceId={selectedSpan.traceId}
                  spanId={selectedSpan.spanId}
                  key={selectedSpan.spanId}
                />
              ) : (
                <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} traceId={traceId} />
              )
            ) : (
              <div className="flex flex-col items-center justify-center size-full text-muted-foreground">
                <span className="text-xl font-medium mb-2">No span selected</span>
                <span className="text-base">Select a span from the trace tree to view its details</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </ScrollContextProvider>
  );
};

export default function TraceView(props: TraceViewProps) {
  return (
    <TraceViewStoreProvider initialTrace={props.propsTrace}>
      <PureTraceView {...props} />
    </TraceViewStoreProvider>
  );
}
