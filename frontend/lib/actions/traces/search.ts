import { type TimeRange } from "@/lib/clickhouse/utils";
import { fetcherJSON } from "@/lib/utils";

export type SnippetInfo = {
  text: string;
  highlight: [number, number];
};

export type SearchSpanHit = {
  trace_id: string;
  span_id: string;
  input_snippet?: SnippetInfo;
  output_snippet?: SnippetInfo;
};

export const searchSpans = async ({
  projectId,
  traceId,
  searchQuery,
  timeRange,
  getSnippets = false,
}: {
  projectId: string;
  traceId?: string;
  searchQuery: string;
  timeRange?: TimeRange;
  getSnippets?: boolean;
}): Promise<SearchSpanHit[]> => {
  const trimmedQuery = searchQuery.trim();
  if (!trimmedQuery) {
    return [];
  }

  let startTime: string | undefined;
  let endTime: string | undefined;

  if (timeRange) {
    if ("start" in timeRange && "end" in timeRange) {
      startTime = timeRange.start.toISOString();
      endTime = timeRange.end.toISOString();
    } else if ("pastHours" in timeRange) {
      const end = new Date();
      const start = new Date(end.getTime() - timeRange.pastHours * 60 * 60 * 1000);
      startTime = start.toISOString();
      endTime = end.toISOString();
    }
  }

  const body = {
    traceId: traceId,
    searchQuery: trimmedQuery,
    startTime,
    endTime,
    limit: 0,
    offset: 0,
    getSnippets,
  };

  try {
    return await fetcherJSON<SearchSpanHit[]>(`/projects/${projectId}/spans/search`, {
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
