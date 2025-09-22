import { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { capitalize } from "lodash";

import { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { TraceViewSpan, TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import { SpanType } from "@/lib/traces/types";

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

const dbSpanRowToSpan = (row: Record<string, any>): TraceViewSpan => ({
  spanId: row.span_id,
  parentSpanId: row.parent_span_id,
  traceId: row.trace_id,
  spanType: row.span_type,
  name: row.name,
  path: row.attributes["lmnr.span.path"] ?? "",
  startTime: row.start_time,
  endTime: row.end_time,
  attributes: row.attributes,
  events: [],
  model: row.attributes["gen_ai.response.model"] ?? row.attributes["gen_ai.request.model"] ?? null,
  collapsed: false,
});

export const onRealtimeUpdateSpans =
  (
    spans: TraceViewSpan[],
    setSpans: (spans: TraceViewSpan[]) => void,
    setTrace: (trace?: TraceViewTrace) => void,
    setShowBrowserSession: (show: boolean) => void,
    trace?: TraceViewTrace
  ) =>
    (payload: RealtimePostgresInsertPayload<Record<string, any>>) => {
      const rtEventSpan = dbSpanRowToSpan(payload.new);

      if (rtEventSpan.attributes["lmnr.internal.has_browser_session"]) {
        setShowBrowserSession(true);
      }

      if (trace) {
        const newTrace = { ...trace };
        newTrace.endTime = new Date(
          Math.max(new Date(newTrace.endTime).getTime(), new Date(rtEventSpan.endTime).getTime())
        ).toUTCString();
        newTrace.totalTokens +=
        (rtEventSpan.attributes["gen_ai.usage.input_tokens"] ?? 0) +
        (rtEventSpan.attributes["gen_ai.usage.output_tokens"] ?? 0);
        newTrace.inputTokens += rtEventSpan.attributes["gen_ai.usage.input_tokens"] ?? 0;
        newTrace.outputTokens += rtEventSpan.attributes["gen_ai.usage.output_tokens"] ?? 0;
        newTrace.inputCost += rtEventSpan.attributes["gen_ai.usage.input_cost"] ?? 0;
        newTrace.outputCost += rtEventSpan.attributes["gen_ai.usage.output_cost"] ?? 0;
        newTrace.totalCost +=
        (rtEventSpan.attributes["gen_ai.usage.input_cost"] ?? 0) +
        (rtEventSpan.attributes["gen_ai.usage.output_cost"] ?? 0);

        setTrace(newTrace);
      }

      const newSpans = [...spans];
      const index = newSpans.findIndex((span) => span.spanId === rtEventSpan.spanId);
      if (index !== -1) {
      // Always replace existing span, regardless of pending status
        newSpans[index] = rtEventSpan;
      } else {
        newSpans.push(rtEventSpan);
      }

      setSpans(enrichSpansWithPending(newSpans));
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
