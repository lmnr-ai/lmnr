import { get } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import Chat from "@/components/traces/trace-view/chat";
import { HumanEvaluatorSpanView } from "@/components/traces/trace-view/human-evaluator-span-view";
import { type TraceViewSpan, type TraceViewTrace, useTraceViewStore } from "@/components/traces/trace-view/store";
import { enrichSpansWithPending, findSpanToSelect, onRealtimeUpdateSpans } from "@/components/traces/trace-view/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { type Filter } from "@/lib/actions/common/filters";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { SpanType } from "@/lib/traces/types";

import { SpanView } from "../span-view";
import FillWidthLayout from "./fill-width-layout";
import FixedWidthLayout from "./fixed-width-layout";
import { ScrollContextProvider } from "./scroll-context";
import TracePanel from "./trace-panel";

export interface TraceViewPanels {
  tracePanel: React.ReactNode;
  spanPanel: React.ReactNode;
  chatPanel: React.ReactNode;
  showSpan: boolean;
  showChat: boolean;
}

export interface TraceViewContentProps {
  traceId: string;
  spanId?: string;
  propsTrace?: TraceViewTrace;
  onClose: () => void;
  isFillWidth?: boolean;
  isAlwaysSelectSpan?: boolean;
  initialSignalsPanelOpen?: boolean;
}

export default function TraceViewContent({
  traceId,
  spanId,
  onClose,
  propsTrace,
  isFillWidth,
  isAlwaysSelectSpan,
  initialSignalsPanelOpen,
}: TraceViewContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useParams();

  // Panel visibility states
  const { tracesAgentOpen, setTracesAgentOpen, selectSpanById, setSignalsPanelOpen } = useTraceViewStore(
    (state) => ({
      tracesAgentOpen: state.tracesAgentOpen,
      setTracesAgentOpen: state.setTracesAgentOpen,
      selectSpanById: state.selectSpanById,
      setSignalsPanelOpen: state.setSignalsPanelOpen,
    }),
    shallow
  );

  // Auto-open signals panel when navigating from the signals page
  useEffect(() => {
    if (initialSignalsPanelOpen) {
      setSignalsPanelOpen(true);
    }
  }, [initialSignalsPanelOpen, setSignalsPanelOpen]);

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
  } = useTraceViewStore(
    (state) => ({
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
    }),
    shallow
  );

  const { hasBrowserSession, setHasBrowserSession, setBrowserSession } = useTraceViewStore(
    (state) => ({
      hasBrowserSession: state.hasBrowserSession,
      setHasBrowserSession: state.setHasBrowserSession,
      setBrowserSession: state.setBrowserSession,
    }),
    shallow
  );

  // Local storage states
  const { spanPath, setSpanPath } = useTraceViewStore(
    (state) => ({
      spanPath: state.spanPath,
      setSpanPath: state.setSpanPath,
    }),
    shallow
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

        const urlSpanId = spanId || searchParams.get("spanId");
        if (urlSpanId && spans.length > 0) {
          const selectedSpan = findSpanToSelect(spans, spanId, searchParams, spanPath);
          setSelectedSpan(selectedSpan);
        } else if (isAlwaysSelectSpan && spans.length > 0) {
          setSelectedSpan(spans[0]);
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
      isAlwaysSelectSpan,
    ]
  );

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("spanId");
    router.push(`${pathName}?${params.toString()}`);
    onClose();
  }, [onClose, pathName, router, searchParams]);

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

  // --- Build panel content JSX ---

  const tracePanel = (
    <TracePanel
      traceId={traceId}
      handleClose={handleClose}
      handleSpanSelect={handleSpanSelect}
      fetchSpans={fetchSpans}
      isLoading={isLoading}
    />
  );

  const spanPanel = (
    <div className="flex flex-col h-full w-full overflow-hidden flex-1">
      {isSpansLoading ? (
        <div className="flex flex-col space-y-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : !selectedSpan ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          No span selected
        </div>
      ) : selectedSpan.spanType === SpanType.HUMAN_EVALUATOR ? (
        <HumanEvaluatorSpanView traceId={selectedSpan.traceId} spanId={selectedSpan.spanId} key={selectedSpan.spanId} />
      ) : (
        <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} traceId={traceId} />
      )}
    </div>
  );

  const chatPanel = trace ? (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <Chat trace={trace} onSetSpanId={selectSpanById} onClose={() => setTracesAgentOpen(false)} />
    </div>
  ) : null;

  const showSpan = !!selectedSpan || (isAlwaysSelectSpan === true && !isLoading && spans.length > 0);
  const showChat = tracesAgentOpen && !!trace;

  const panels: TraceViewPanels = {
    tracePanel,
    spanPanel,
    chatPanel,
    showSpan,
    showChat,
  };

  return (
    <ScrollContextProvider>
      {isFillWidth ? <FillWidthLayout panels={panels} /> : <FixedWidthLayout panels={panels} />}
    </ScrollContextProvider>
  );
}
