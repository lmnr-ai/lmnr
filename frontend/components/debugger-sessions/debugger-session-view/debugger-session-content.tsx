"use client";

import { get, isEmpty } from "lodash";
import { AlertTriangle, CirclePlay, Radio } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo } from "react";

import Header from "@/components/debugger-sessions/debugger-session-view/header";
import Loading, { SpansLoading } from "@/components/debugger-sessions/debugger-session-view/loading.tsx";
import { useDebuggerSessionStore } from "@/components/debugger-sessions/debugger-session-view/store";
import { fetchSystemMessages } from "@/components/debugger-sessions/debugger-session-view/system-messages-utils";
import { SessionTerminatedOverlay } from "@/components/debugger-sessions/debugger-session-view/terminated-overlay.tsx";
import {
  onRealtimeStartSpan,
  onRealtimeUpdateSpans,
} from "@/components/debugger-sessions/debugger-session-view/utils.ts";
import SessionPlayer from "@/components/traces/session-player";
import { SpanView } from "@/components/traces/span-view";
import { TraceStatsShields } from "@/components/traces/stats-shields";
import CondensedTimeline from "@/components/traces/trace-view/condensed-timeline";
import { HumanEvaluatorSpanView } from "@/components/traces/trace-view/human-evaluator-span-view";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view.tsx";
import List from "@/components/traces/trace-view/list";
import { ScrollContextProvider } from "@/components/traces/trace-view/scroll-context";
import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import Tree from "@/components/traces/trace-view/tree";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import ViewDropdown from "@/components/traces/trace-view/view-dropdown";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type Filter } from "@/lib/actions/common/filters";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";

interface DebuggerSessionContentProps {
  sessionId: string;
  spanId?: string;
}

export default function DebuggerSessionContent({ sessionId, spanId }: DebuggerSessionContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useParams();

  const {
    // Data state
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
    // UI state
    tab,
    browserSession,
    setBrowserSession,
    langGraph,
    getHasLangGraph,
    hasBrowserSession,
    setHasBrowserSession,
    setSpanPath,
    condensedTimelineEnabled,
    condensedTimelineVisibleSpanIds,
    // Debugger state
    setSystemMessagesMap,
    setIsSystemMessagesLoading,
    setSessionStatus,
    sessionStatus,
    isSessionDeleted,
    setIsSessionDeleted,
  } = useDebuggerSessionStore((state) => ({
    // Data state
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
    // UI state
    tab: state.tab,
    browserSession: state.browserSession,
    setBrowserSession: state.setBrowserSession,
    langGraph: state.langGraph,
    getHasLangGraph: state.getHasLangGraph,
    hasBrowserSession: state.hasBrowserSession,
    setHasBrowserSession: state.setHasBrowserSession,
    setSpanPath: state.setSpanPath,
    condensedTimelineEnabled: state.condensedTimelineEnabled,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
    // Debugger state
    setSystemMessagesMap: state.setSystemMessagesMap,
    setIsSystemMessagesLoading: state.setIsSystemMessagesLoading,
    setSessionStatus: state.setSessionStatus,
    sessionStatus: state.sessionStatus,
    isSessionDeleted: state.isSessionDeleted,
    setIsSessionDeleted: state.setIsSessionDeleted,
  }));

  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);
  const filteredSpansForStats = useMemo(() => {
    if (condensedTimelineVisibleSpanIds.size === 0) return undefined;
    return spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));
  }, [spans, condensedTimelineVisibleSpanIds]);
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

  const handleFetchTrace = useCallback(async () => {
    if (!trace?.id) return;

    try {
      setIsTraceLoading(true);
      setTraceError(undefined);

      const response = await fetch(`/api/projects/${projectId}/traces/${trace?.id}`);

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
  }, [projectId, setBrowserSession, setHasBrowserSession, setIsTraceLoading, setTrace, setTraceError]);

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
      if (!trace?.id) return;

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

        const url = `/api/projects/${projectId}/traces/${trace?.id}/spans?${params.toString()}`;
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
      trace?.id,
      setSpans,
      hasBrowserSession,
      setHasBrowserSession,
      setBrowserSession,
    ]
  );

  const isLoading = isTraceLoading && !trace;

  const eventHandlers = useMemo(
    () => ({
      span_start: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (payload.span) {
          onRealtimeStartSpan(setSpans, setTrace, setBrowserSession, setHasBrowserSession)(payload.span);
        }
      },
      span_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (payload.spans && Array.isArray(payload.spans)) {
          for (const span of payload.spans) {
            onRealtimeUpdateSpans(setSpans, setTrace, setBrowserSession, setHasBrowserSession)(span);
          }
        }
      },
      status_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (payload.status) {
          setSessionStatus(payload.status);
        }
      },
      session_deleted: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (payload.session_id) {
          setIsSessionDeleted(true);
        }
      },
    }),
    [setSpans, setTrace, setBrowserSession, setHasBrowserSession, setSessionStatus, setIsSessionDeleted]
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
    if (!trace?.id) return;
    fetchSpans("", []);

    return () => {
      setSpans([]);
      setTraceError(undefined);
      setSpansError(undefined);
    };
  }, [projectId, setSpans, setTraceError, setSpansError]);

  const llmPathsRef = React.useRef<Array<{ key: string; path: string[] }>>([]);
  const llmPaths = useMemo(() => {
    const paths = new Map<string, string[]>();
    for (const span of spans) {
      const path = get(span.attributes, "lmnr.span.path") as string[] | undefined;
      if (span.spanType === SpanType.LLM && path && !span.pending) {
        paths.set(path.join("."), path);
      }
    }
    const newPaths = Array.from(paths.entries()).map(([key, path]) => ({ key, path }));

    if (newPaths.map((p) => p.key).join("|") === llmPathsRef.current.map((p) => p.key).join("|")) {
      return llmPathsRef.current;
    }

    llmPathsRef.current = newPaths;
    return newPaths;
  }, [spans]);

  useEffect(() => {
    if (!projectId || !trace?.id || isEmpty(llmPaths)) return;

    const loadSystemMessages = async () => {
      setIsSystemMessagesLoading(true);
      try {
        const messages = await fetchSystemMessages(projectId as string, trace?.id, llmPaths);
        setSystemMessagesMap(messages);
      } catch (error) {
        console.error("Failed to fetch system messages:", error);
      } finally {
        setIsSystemMessagesLoading(false);
      }
    };

    loadSystemMessages();
  }, [projectId, trace?.id, setIsSystemMessagesLoading, setSystemMessagesMap, llmPaths]);

  useRealtime({
    key: `rollout_session_${sessionId}`,
    projectId: projectId as string,
    enabled: !!sessionId && !!projectId,
    eventHandlers,
  });

  if (isLoading) {
    return <Loading />;
  }

  if (traceError) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <Header spans={[]} onSearch={() => {}} />
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

  if (isEmpty(spans) && !isSpansLoading && (sessionStatus === "PENDING" || sessionStatus === "RUNNING")) {
    return (
      <div className="flex flex-1 h-full flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md mx-auto">
          <Radio className="w-10 h-10 text-muted-foreground/50 mx-auto mb-4 animate-pulse" />
          <h3 className="text-base font-medium text-secondary-foreground mb-2">
            {sessionStatus === "RUNNING" ? "Running debugger..." : "Waiting for traces..."}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {sessionStatus === "RUNNING"
              ? "Debugger is running. Traces will appear here once they arrive."
              : "Run the debugger session to start, or traces will appear here when your code runs."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollContextProvider>
      <div className="flex flex-col h-full w-full overflow-hidden">
        {isSessionDeleted && <SessionTerminatedOverlay />}

        <Header spans={spans} onSearch={(filters, search) => fetchSpans(search, filters)} />

        {spansError ? (
          <div className="flex flex-col items-center justify-center flex-1 p-4 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
            <h4 className="text-sm font-semibold text-destructive mb-2">Error Loading Spans</h4>
            <p className="text-xs text-muted-foreground">{spansError}</p>
          </div>
        ) : isSpansLoading ? (
          <SpansLoading />
        ) : (
          <ResizablePanelGroup id="debugger-session-view-panels" orientation="vertical">
            {condensedTimelineEnabled && (
              <>
                <ResizablePanel defaultSize={120} minSize={80}>
                  <div className="border-t h-full">
                    <CondensedTimeline />
                  </div>
                </ResizablePanel>
                <ResizableHandle />
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
                <ResizableHandle className="z-50" withHandle />
                <ResizablePanel>
                  {!isLoading && trace?.id && (
                    <SessionPlayer
                      onClose={() => setBrowserSession(false)}
                      hasBrowserSession={hasBrowserSession}
                      traceId={trace?.id}
                      llmSpanIds={llmSpanIds}
                    />
                  )}
                </ResizablePanel>
              </>
            )}
            {langGraph && hasLangGraph && <LangGraphView spans={spans} />}
          </ResizablePanelGroup>
        )}

        <Sheet open={!!selectedSpan} onOpenChange={(open) => !open && handleSpanSelect(undefined)}>
          <SheetContent
            side="right"
            className="min-w-[50vw] w-[50vw] flex flex-col p-0 gap-0 focus-visible:outline-none"
          >
            <SheetHeader className="hidden">
              <SheetTitle />
              <SheetDescription />
            </SheetHeader>
            <div className="flex-1 overflow-hidden focus-visible:outline-none">
              {selectedSpan &&
                (selectedSpan.spanType === SpanType.HUMAN_EVALUATOR ? (
                  <HumanEvaluatorSpanView
                    traceId={selectedSpan.traceId}
                    spanId={selectedSpan.spanId}
                    key={selectedSpan.spanId}
                  />
                ) : (
                  <SpanView spanId={selectedSpan.spanId} traceId={selectedSpan?.traceId} />
                ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </ScrollContextProvider>
  );
}
