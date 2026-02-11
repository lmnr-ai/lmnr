import { searchSpans } from "@/lib/actions/traces/search";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { type TimeRange } from "@/lib/clickhouse/utils";

export async function getSearchTraceIds(
  projectId: string,
  search: string | null | undefined,
  searchIn: string[],
  evaluationCreatedAt?: string
): Promise<string[]> {
  if (!search) return [];

  const spanHits = await searchSpans({
    projectId,
    traceId: undefined,
    searchQuery: search,
    timeRange: getTimeRangeForEvaluation(evaluationCreatedAt),
    searchType: searchIn as SpanSearchType[],
  });

  return [...new Set(spanHits.map((span) => span.trace_id))];
}

export const getTimeRangeForEvaluation = (evaluationCreatedAt?: string): TimeRange => {
  if (!evaluationCreatedAt) {
    return {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    };
  }

  const startTime = new Date(evaluationCreatedAt);
  const endTime = new Date(evaluationCreatedAt);
  endTime.setHours(endTime.getHours() + 24);

  return { start: startTime, end: endTime };
};
