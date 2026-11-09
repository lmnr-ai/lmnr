import { get } from "lodash";
import { useParams, useSearchParams } from "next/navigation";
import { useQueryState } from "nuqs";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { HumanEvaluatorSpanView } from "@/components/traces/trace-view/human-evaluator-span-view";
import { type TraceViewSpan, type TraceViewTrace, useTraceViewStore } from "@/components/traces/trace-view/store";
import { useUrlState } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending, findSpanToSelect, onRealtimeUpdateSpans } from "@/components/traces/trace-view/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { SpanType } from "@/lib/traces/types";

import { SpanView } from "../span-view";
import { SpanViewSkeleton } from "../span-view/skeleton";
import { SPAN_TAB_PARAM, type SpanViewTab, spanTabParser } from "../span-view/use-span-view-tab";
import DynamicWidthLayout from "./dynamic-width-layout";
import FillWidthLayout from "./fill-width-layout";
import TracePanel from "./trace-panel";
import { useTracePanelNavigate } from "./trace-panel-url";
import { type TraceViewLayout, type TraceViewPanels } from "./trace-view-panels";

// The span tab holding a search hit, so selecting a hit lands on it.
const snippetTabOf = (span?: TraceViewSpan): SpanViewTab | undefined =>
  span?.inputSnippet || span?.outputSnippet ? "content" : span?.attributesSnippet ? "attributes" : undefined;

const FILL: TraceViewLayout = { type: "fill" };

export interface TraceViewContentProps {
  traceId: string;
  spanId?: string;
  propsTrace?: TraceViewTrace;
  // Omit to hide the close button entirely (e.g. an always-open panel).
  onClose?: () => void;
  isAlwaysSelectSpan?: boolean;
  layout?: TraceViewLayout;
}

export default function TraceViewContent({
  traceId,
  spanId,
  onClose,
  propsTrace,
  isAlwaysSelectSpan,
  layout = FILL,
}: TraceViewContentProps) {
  const searchParams = useSearchParams();
  const { projectId } = useParams();

  // Panel visibility states
  const spanPanelOpen = useTraceViewStore((state) => state.spanPanelOpen);

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
    setTraceError,
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
      setTraceError: state.setTraceError,
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

  const initialSearch = useTraceViewStore((state) => state.initialSearch);

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

  const navigate = useTracePanelNavigate();
  const urlState = useUrlState();
  const [, setSpanTab] = useQueryState(SPAN_TAB_PARAM, spanTabParser);

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (!span) return;
      setSelectedSpan(span);
      navigate({ type: "selectSpan", spanId: span.spanId, spanTab: urlState ? snippetTabOf(span) : undefined });
    },
    [setSelectedSpan, navigate, urlState]
  );

  const [traceSearchTerm, setTraceSearchTerm] = useState("");

  const fetchSpans = useCallback(
    async (search: string, filters: Filter[]) => {
      try {
        setIsSpansLoading(true);
        setSpansError(undefined);
        setTraceSearchTerm(search);

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
        // Auto-select the first span only in the dedicated trace page (always-select mode).
        // In drawer layouts we leave the selection empty unless the user explicitly opens a span.
        const selectedSpan =
          spans.length === 0
            ? undefined
            : urlSpanId
              ? findSpanToSelect(spans, spanId, searchParams)
              : isAlwaysSelectSpan
                ? spans[0]
                : undefined;
        setSelectedSpan(selectedSpan);

        // A kept `spanTab` would hide the hit. Only the tab is written: `spanId` and the message hash stay as they are.
        const snippetTab = search ? snippetTabOf(selectedSpan) : undefined;
        if (urlState && snippetTab) void setSpanTab(snippetTab);
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
      spanId,
      searchParams,
      urlState,
      setSpanTab,
    ]
  );

  const handleSpanPanelClose = useCallback(() => {
    setSelectedSpan(undefined);
    navigate({ type: "closeSpan" });
  }, [setSelectedSpan, navigate]);

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

  // Apply each URL spanId once: re-applying on every `spans` change would override selections
  // made without touching the URL (span reference links, realtime updates).
  const appliedSpanIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!spanId) {
      appliedSpanIdRef.current = undefined;
      return;
    }
    if (isSpansLoading || appliedSpanIdRef.current === spanId) return;
    const span = spans?.find((s) => s.spanId === spanId);
    if (span) {
      appliedSpanIdRef.current = spanId;
      setSelectedSpan(span);
    }
  }, [isSpansLoading, setSelectedSpan, spanId, spans]);

  useEffect(() => {
    handleFetchTrace();
  }, [handleFetchTrace]);

  useEffect(() => {
    fetchSpans(initialSearch, []);

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
      // No onClose ⇒ no close button (always-open panels).
      handleClose={onClose}
      handleSpanSelect={handleSpanSelect}
      fetchSpans={fetchSpans}
      isLoading={isLoading}
    />
  );

  const spanPanel = (
    <div className="flex flex-col h-full w-full overflow-hidden flex-1">
      {!selectedSpan ? (
        <SpanViewSkeleton />
      ) : selectedSpan.spanType === SpanType.HUMAN_EVALUATOR ? (
        <HumanEvaluatorSpanView
          traceId={selectedSpan.traceId}
          spanId={selectedSpan.spanId}
          key={selectedSpan.spanId}
          onClose={handleSpanPanelClose}
          isAlwaysSelectSpan={isAlwaysSelectSpan}
        />
      ) : (
        <SpanView
          key={selectedSpan.spanId}
          spanId={selectedSpan.spanId}
          traceId={traceId}
          initialSearchTerm={traceSearchTerm}
          initialTab={snippetTabOf(selectedSpan)}
          onClose={handleSpanPanelClose}
          isAlwaysSelectSpan={isAlwaysSelectSpan}
        />
      )}
    </div>
  );

  // Chat is no longer a panel inside the trace layout — it's the page-level agent column (see the
  // project layout). The trace drawer just reflows within the space left of it.
  const panels: TraceViewPanels = {
    tracePanel,
    spanPanel,
    showSpan: spanPanelOpen,
  };

  return layout.type === "fill" ? (
    <FillWidthLayout panels={panels} />
  ) : (
    <DynamicWidthLayout panels={panels} maxWidth={layout.maxWidth} slideIn={layout.slideIn} />
  );
}
