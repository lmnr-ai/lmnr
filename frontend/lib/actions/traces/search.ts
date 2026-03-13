import { type SpanSearchType } from "@/lib/clickhouse/types";
import { type TimeRange } from "@/lib/time";
import { fetcherJSON } from "@/lib/utils";

export const searchSpans = async ({
  projectId,
  traceId,
  searchQuery,
  timeRange,
  searchType,
}: {
  projectId: string;
  traceId?: string;
  searchQuery: string;
  timeRange?: TimeRange;
  searchType?: SpanSearchType[];
}): Promise<{ trace_id: string; span_id: string }[]> => {
  const trimmedQuery = searchQuery.trim();
  if (!trimmedQuery) {
    return [];
  }

  const body = {
    traceId: traceId,
    searchQuery: trimmedQuery,
    startTime: timeRange?.start.toISOString(),
    endTime: timeRange?.end.toISOString(),
    searchIn: searchType?.map((t) => t.toString()),
    // Pagination is currently disabled (defaults on app-server side): API paginates by traces, search engine by spans
    limit: 0,
    offset: 0,
  };

  try {
    return await fetcherJSON<{ trace_id: string; span_id: string }[]>(`/projects/${projectId}/spans/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("searchSpans error", error);
    return [];
  }
};
