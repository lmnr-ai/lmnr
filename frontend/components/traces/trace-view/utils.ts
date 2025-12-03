import { capitalize } from "lodash";

import { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { TraceViewSpan, TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { RealtimeSpan, SpanType } from "@/lib/traces/types";

export const enrichSpansWithPending = (existingSpans: TraceViewSpan[]): TraceViewSpan[] => {
  const existingSpanIds = new Set(existingSpans.map((span) => span.spanId));
  const pendingSpans = new Map<string, TraceViewSpan>();

  // First, add all existing pending spans to the pendingSpans map
  for (const span of existingSpans) {
    if (span.pending) {
      pendingSpans.set(span.spanId, span);
    }
  }

  for (const span of existingSpans) {
    if (span.parentSpanId) {
      const parentSpanIds = span.attributes["lmnr.span.ids_path"] as string[] | undefined;
      const parentSpanNames = span.attributes["lmnr.span.path"] as string[] | undefined;

      if (
        parentSpanIds === undefined ||
        parentSpanNames === undefined ||
        parentSpanIds.length === 0 ||
        parentSpanNames.length === 0 ||
        parentSpanIds.length !== parentSpanNames.length
      ) {
        continue;
      }

      const startTime = new Date(span.startTime);
      const endTime = new Date(span.endTime);
      for (let i = 0; i < parentSpanIds.length; i++) {
        const spanId = parentSpanIds[i];
        const spanName = parentSpanNames[i];

        // Skip if this span exists and is not pending
        if (existingSpanIds.has(spanId) && !pendingSpans.has(spanId)) {
          continue;
        }

        if (pendingSpans.has(spanId)) {
          // Update the time range of the pending span to cover all its children
          const existingStartTime = new Date(pendingSpans.get(spanId)!.startTime);
          const existingEndTime = new Date(pendingSpans.get(spanId)!.endTime);
          pendingSpans.set(spanId, {
            ...pendingSpans.get(spanId)!,
            startTime: (startTime < existingStartTime ? startTime : existingStartTime).toISOString(),
            endTime: (endTime > existingEndTime ? endTime : existingEndTime).toISOString(),
          });
          continue;
        }

        const parentSpanId = i > 0 ? parentSpanIds[i - 1] : undefined;
        const pendingSpan: TraceViewSpan = {
          spanId,
          name: spanName,
          parentSpanId,
          startTime: new Date(span.startTime).toISOString(),
          endTime: new Date(span.endTime).toISOString(),
          attributes: {},
          events: [],
          traceId: span.traceId,
          spanType: SpanType.DEFAULT,
          path: "",
          pending: true,
          status: span.status,
          collapsed: false,
        };
        pendingSpans.set(spanId, pendingSpan);
      }
    }
  }

  // Filter out existing spans that are pending (to avoid duplicates)
  const nonPendingExistingSpans = existingSpans.filter((span) => !span.pending);

  return [...nonPendingExistingSpans, ...pendingSpans.values()];
};

export const filterColumns: ColumnFilter[] = [
  {
    key: "span_id",
    name: "ID",
    dataType: "string",
  },
  {
    name: "Type",
    dataType: "enum",
    key: "span_type",
    options: Object.values(SpanType).map((v) => ({
      label: v,
      value: v,
      icon: createSpanTypeIcon(v, "w-4 h-4", 14),
    })),
  },
  {
    name: "Status",
    dataType: "enum",
    key: "status",
    options: ["success", "error"].map((v) => ({
      label: capitalize(v),
      value: v,
    })),
  },
  {
    key: "name",
    name: "Name",
    dataType: "string",
  },
  {
    key: "latency",
    name: "Latency",
    dataType: "number",
  },
  {
    key: "tokens",
    name: "Tokens",
    dataType: "number",
  },
  {
    key: "cost",
    name: "Cost",
    dataType: "number",
  },
  {
    key: "tags",
    name: "Tags",
    dataType: "string",
  },
  {
    key: "model",
    name: "Model",
    dataType: "string",
  },
];

export const getDefaultTraceViewWidth = () => {
  if (typeof window !== "undefined") {
    const viewportWidth = window.innerWidth;
    const seventyFivePercent = viewportWidth * 0.75;
    return Math.min(seventyFivePercent, 1100);
  }
  return 1000;
};

export const onRealtimeUpdateSpans =
  (
    setSpans: (spans: TraceViewSpan[] | ((prevSpans: TraceViewSpan[]) => TraceViewSpan[])) => void,
    setTrace: (trace?: TraceViewTrace | ((prevTrace?: TraceViewTrace) => TraceViewTrace | undefined)) => void,
    setShowBrowserSession: (show: boolean) => void
  ) =>
    (newSpan: RealtimeSpan) => {
      if (newSpan.attributes["lmnr.internal.has_browser_session"]) {
        setShowBrowserSession(true);
      }

      setTrace((trace) => {
        if (!trace) return trace;

        const newTrace = { ...trace };

        newTrace.startTime =
        new Date(newTrace.startTime).getTime() < new Date(newSpan.startTime).getTime()
          ? newTrace.startTime
          : newSpan.startTime;
        newTrace.endTime =
        new Date(newTrace.endTime).getTime() > new Date(newSpan.endTime).getTime() ? newTrace.endTime : newSpan.endTime;
        newTrace.totalTokens +=
        (newSpan.attributes["gen_ai.usage.input_tokens"] ?? 0) +
        (newSpan.attributes["gen_ai.usage.output_tokens"] ?? 0);
        newTrace.inputTokens += newSpan.attributes["gen_ai.usage.input_tokens"] ?? 0;
        newTrace.outputTokens += newSpan.attributes["gen_ai.usage.output_tokens"] ?? 0;
        newTrace.inputCost += newSpan.attributes["gen_ai.usage.input_cost"] ?? 0;
        newTrace.outputCost += newSpan.attributes["gen_ai.usage.output_cost"] ?? 0;
        newTrace.totalCost +=
        (newSpan.attributes["gen_ai.usage.input_cost"] ?? 0) + (newSpan.attributes["gen_ai.usage.output_cost"] ?? 0);
        return newTrace;
      });

      setSpans((spans) => {
        const newSpans = [...spans];
        const index = newSpans.findIndex((span) => span.spanId === newSpan.spanId);
        if (index !== -1) {
        // Always replace existing span, regardless of pending status
          newSpans[index] = {
            ...newSpan,
            collapsed: newSpans[index].collapsed || false,
            events: [],
            path: "",
          };
        } else {
          newSpans.push({
            ...newSpan,
            collapsed: false,
            events: [],
            path: "",
          });
        }

        return enrichSpansWithPending(newSpans);
      });
    };

export const isSpanPathsEqual = (path1: string[] | null, path2: string[] | null): boolean => {
  if (!path1 || !path2) return false;
  if (path1.length !== path2.length) return false;
  return path1.every((item, index) => item === path2[index]);
};

export const findSpanToSelect = (
  spans: TraceViewSpan[],
  spanId: string | undefined,
  searchParams: URLSearchParams,
  spanPath: string[] | null
): TraceViewSpan | undefined => {
  // Priority 1: Span from URL (either prop or search params)
  const urlSpanId = spanId || searchParams.get("spanId");
  if (urlSpanId) {
    const spanFromUrl = spans.find((span) => span.spanId === urlSpanId);
    if (spanFromUrl) return spanFromUrl;
  }

  // Priority 2: Span matching saved path from local storage
  if (spanPath) {
    const spanFromPath = spans.find((span) => {
      const attributePath = span.attributes?.["lmnr.span.path"];
      return Array.isArray(attributePath) && isSpanPathsEqual(attributePath, spanPath);
    });
    if (spanFromPath) return spanFromPath;
  }

  // Priority 3: First span as fallback
  return spans?.[0];
};



export const getSpanDisplayName = (span:TraceViewSpan) => {
  const modelName = span.model ?? span.attributes["gen_ai.request.model"];
  return span.spanType === "LLM" && modelName ? modelName : span.name;
};


export const getLLMMetrics = (span:TraceViewSpan)=>{
  if (span.aggregatedMetrics?.hasLLMDescendants) {
    const cost = span.aggregatedMetrics.totalCost.toFixed(3);
    const totalTokens = span.aggregatedMetrics.totalTokens;

    return {
      cost,
      totalTokens,
      isAggregated: true,
    };
  }

  if (span.spanType !== "LLM") return null;

  const costValue = span.attributes["gen_ai.usage.cost"];
  const inputTokens = span.attributes["gen_ai.usage.input_tokens"];
  const outputTokens = span.attributes["gen_ai.usage.output_tokens"];

  if (costValue == null || inputTokens == null || outputTokens == null) return null;

  const cost = costValue.toFixed(3);
  const totalTokens = inputTokens + outputTokens;

  return { cost, totalTokens, isAggregated: false };
};
