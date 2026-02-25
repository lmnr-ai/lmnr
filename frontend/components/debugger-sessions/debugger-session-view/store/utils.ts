import { type TraceViewSpan } from "@/components/traces/trace-view/store";
import { SpanType } from "@/lib/traces/types.ts";

export const deriveCheckpointSpanId = (
  spans: TraceViewSpan[],
  cachedSpanCounts: Record<string, number>
): string | undefined => {
  const llmSpans = spans
    .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const seenPerPath: Record<string, number> = {};

  for (const span of llmSpans) {
    const spanPath = span.attributes?.["lmnr.span.path"];
    if (!spanPath || !Array.isArray(spanPath)) continue;

    const pathKey = spanPath.join(".");
    const cacheCount = cachedSpanCounts[pathKey] || 0;
    const seen = seenPerPath[pathKey] || 0;

    if (seen >= cacheCount) {
      return span.spanId;
    }

    seenPerPath[pathKey] = seen + 1;
  }

  return undefined;
};
