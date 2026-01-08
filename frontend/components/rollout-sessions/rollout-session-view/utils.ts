import { get } from "lodash";

import { TraceViewSpan, TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils.ts";
import { aggregateSpanMetrics } from "@/lib/actions/spans/utils.ts";
import { RealtimeSpan } from "@/lib/traces/types.ts";

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
            inputCost: inputCost,
            outputCost: outputCost,
            totalCost: totalCost,
            metadata: "",
            status: newSpan.status || "OK",
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
            inputCost: inputCost,
            outputCost: outputCost,
            totalCost: totalCost,
            metadata: trace.metadata || "",
            status: newSpan.status || "OK",
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
        newTrace.inputCost += inputCost;
        newTrace.outputCost += outputCost;
        newTrace.totalCost += totalCost;

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
