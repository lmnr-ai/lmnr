import { get } from "lodash";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils.ts";
import { aggregateSpanMetrics } from "@/lib/actions/spans/utils.ts";
import { type RealtimeSpan } from "@/lib/traces/types.ts";

export const onRealtimeStartSpan =
  (
    setSpans: (spans: TraceViewSpan[] | ((prevSpans: TraceViewSpan[]) => TraceViewSpan[])) => void,
    setTrace: (trace?: TraceViewTrace | ((prevTrace?: TraceViewTrace) => TraceViewTrace | undefined)) => void,
    setShowBrowserSession: (show: boolean) => void,
    setHasBrowserSession: (hasBrowserSession: boolean) => void
  ) =>
  (newSpan: Omit<RealtimeSpan, "endTime"> & { endTime?: string }) => {
    if (newSpan.attributes["lmnr.internal.has_browser_session"]) {
      setShowBrowserSession(true);
      setHasBrowserSession(true);
    }

    setTrace((trace) => {
      // If no trace exists, create one from span data
      if (!trace) {
        return {
          id: newSpan.traceId,
          startTime: newSpan.startTime,
          endTime: newSpan.startTime, // Use startTime as temporary endTime
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          metadata: "",
          status: newSpan.status || "success",
          traceType: "DEFAULT",
          visibility: "private",
          hasBrowserSession: !!newSpan.attributes["lmnr.internal.has_browser_session"],
        } as TraceViewTrace;
      }

      // If trace ID differs from span's trace ID, create new trace from span
      // This handles when a new rollout run creates a new trace
      if (trace.id !== newSpan.traceId) {
        return {
          id: newSpan.traceId,
          startTime: newSpan.startTime,
          endTime: newSpan.startTime, // Use startTime as temporary endTime
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          metadata: trace.metadata || "",
          status: newSpan.status || "success",
          traceType: trace.traceType || "DEFAULT",
          visibility: trace.visibility || "private",
          hasBrowserSession: trace.hasBrowserSession || !!newSpan.attributes["lmnr.internal.has_browser_session"],
        } as TraceViewTrace;
      }

      // Update trace start time if this span started earlier
      const newTrace = { ...trace };
      newTrace.startTime =
        new Date(newTrace.startTime).getTime() < new Date(newSpan.startTime).getTime()
          ? newTrace.startTime
          : newSpan.startTime;

      if (newSpan.attributes["lmnr.internal.has_browser_session"]) {
        newTrace.hasBrowserSession = true;
      }

      return newTrace;
    });

    setSpans((spans) => {
      const newSpans = [...spans];
      const index = newSpans.findIndex((span) => span.spanId === newSpan.spanId);

      // Only add if span doesn't exist yet
      if (index === -1) {
        const pendingSpan: TraceViewSpan = {
          spanId: newSpan.spanId,
          parentSpanId: newSpan.parentSpanId,
          traceId: newSpan.traceId,
          name: newSpan.name,
          startTime: newSpan.startTime,
          endTime: newSpan.startTime, // Use startTime as temporary endTime for pending spans
          attributes: newSpan.attributes,
          spanType: newSpan.spanType,
          path: "",
          events: [],
          status: newSpan.status,
          pending: true,
          collapsed: false,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
        };
        newSpans.push(pendingSpan);

        newSpans.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        return aggregateSpanMetrics(enrichSpansWithPending(newSpans));
      }

      // If span already exists, don't modify it (likely a race condition where update arrived first)
      return spans;
    });
  };

export const onRealtimeUpdateSpans =
  (
    setSpans: (spans: TraceViewSpan[] | ((prevSpans: TraceViewSpan[]) => TraceViewSpan[])) => void,
    setTrace: (trace?: TraceViewTrace | ((prevTrace?: TraceViewTrace) => TraceViewTrace | undefined)) => void,
    setShowBrowserSession: (show: boolean) => void,
    setHasBrowserSession: (hasBrowserSession: boolean) => void
  ) =>
  (newSpan: RealtimeSpan) => {
    if (newSpan.attributes["lmnr.internal.has_browser_session"]) {
      setShowBrowserSession(true);
      setHasBrowserSession(true);
    }

    const inputTokens = get(newSpan.attributes, "gen_ai.usage.input_tokens", 0);
    const outputTokens = get(newSpan.attributes, "gen_ai.usage.output_tokens", 0);
    const cacheReadInputTokens = get(newSpan.attributes, "gen_ai.usage.cache_read_input_tokens", 0);
    const totalTokens = inputTokens + outputTokens;
    const inputCost = get(newSpan.attributes, "gen_ai.usage.input_cost", 0);
    const outputCost = get(newSpan.attributes, "gen_ai.usage.output_cost", 0);
    const totalCost = get(newSpan.attributes, "gen_ai.usage.cost", inputCost + outputCost);
    const model = get(newSpan.attributes, "gen_ai.response.model") ?? get(newSpan.attributes, "gen_ai.request.model");

    setTrace((trace) => {
      // If no trace exists, create one from span data
      if (!trace) {
        return {
          id: newSpan.traceId,
          startTime: newSpan.startTime,
          endTime: newSpan.endTime,
          totalTokens: totalTokens,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          cacheReadInputTokens: cacheReadInputTokens,
          inputCost: inputCost,
          outputCost: outputCost,
          totalCost: totalCost,
          metadata: "",
          status: newSpan.status || "success",
          traceType: "DEFAULT",
          visibility: "private",
          hasBrowserSession: !!newSpan.attributes["lmnr.internal.has_browser_session"],
        } as TraceViewTrace;
      }

      // If trace ID differs from span's trace ID, create new trace from span
      // This handles when a new rollout run creates a new trace
      if (trace.id !== newSpan.traceId) {
        return {
          id: newSpan.traceId,
          startTime: newSpan.startTime,
          endTime: newSpan.endTime,
          totalTokens: totalTokens,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          cacheReadInputTokens: cacheReadInputTokens,
          inputCost: inputCost,
          outputCost: outputCost,
          totalCost: totalCost,
          metadata: trace.metadata || "",
          status: newSpan.status || "success",
          traceType: trace.traceType || "DEFAULT",
          visibility: trace.visibility || "private",
          hasBrowserSession: trace.hasBrowserSession || !!newSpan.attributes["lmnr.internal.has_browser_session"],
        } as TraceViewTrace;
      }

      // Update existing trace with accumulated statistics
      const newTrace = { ...trace };

      newTrace.startTime =
        new Date(newTrace.startTime).getTime() < new Date(newSpan.startTime).getTime()
          ? newTrace.startTime
          : newSpan.startTime;
      newTrace.endTime =
        new Date(newTrace.endTime).getTime() > new Date(newSpan.endTime).getTime() ? newTrace.endTime : newSpan.endTime;
      newTrace.totalTokens += totalTokens;
      newTrace.inputTokens += inputTokens;
      newTrace.outputTokens += outputTokens;
      newTrace.cacheReadInputTokens = (newTrace.cacheReadInputTokens || 0) + cacheReadInputTokens;
      newTrace.inputCost += inputCost;
      newTrace.outputCost += outputCost;
      newTrace.totalCost += totalCost;
      if (newSpan.status === "error") {
        newTrace.status = "error";
      }

      if (newSpan.attributes["lmnr.internal.has_browser_session"]) {
        newTrace.hasBrowserSession = true;
      }

      return newTrace;
    });

    setSpans((spans) => {
      const newSpans = [...spans];
      const index = newSpans.findIndex((span) => span.spanId === newSpan.spanId);

      let updatedSpan: TraceViewSpan;

      if (index !== -1) {
        // Always replace existing span, regardless of pending status
        updatedSpan = {
          ...newSpan,
          totalTokens,
          inputTokens,
          outputTokens,
          cacheReadInputTokens,
          inputCost,
          outputCost,
          totalCost,
          model,
          collapsed: newSpans[index].collapsed || false,
          events: [],
          path: "",
        };
        newSpans[index] = updatedSpan;
      } else {
        updatedSpan = {
          ...newSpan,
          totalTokens,
          inputTokens,
          outputTokens,
          cacheReadInputTokens,
          inputCost,
          outputCost,
          totalCost,
          model,
          collapsed: false,
          events: [],
          path: "",
        };
        newSpans.push(updatedSpan);
      }

      newSpans.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      return aggregateSpanMetrics(enrichSpansWithPending(newSpans));
    });
  };
