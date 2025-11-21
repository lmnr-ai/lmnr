import { SpanSearchType } from "@/lib/clickhouse/types";
import { TimeRange } from "@/lib/clickhouse/utils";
import { fetcherJSON } from "@/lib/utils";

export const searchSpans = async ({
  projectId,
  searchQuery,
  timeRange,
  searchType,
  pageSize,
  offset,
}: {
  projectId: string;
  searchQuery: string;
  timeRange: TimeRange;
  searchType?: SpanSearchType[];
  pageSize: number;
  offset: number;
}): Promise<string[]> => {
  const trimmedQuery = searchQuery.trim();
  if (!trimmedQuery) {
    return [];
  }

  let startTime: string | undefined;
  let endTime: string | undefined;

  if ("start" in timeRange && "end" in timeRange) {
    startTime = timeRange.start.toISOString();
    endTime = timeRange.end.toISOString();
  } else if ("pastHours" in timeRange) {
    if (timeRange.pastHours !== "all") {
      const end = new Date();
      const start = new Date(end.getTime() - timeRange.pastHours * 60 * 60 * 1000);
      startTime = start.toISOString();
      endTime = end.toISOString();
    }
  }

  const body = {
    searchQuery: trimmedQuery,
    startTime,
    endTime,
    searchIn: searchType?.map((t) => t.toString()),
    limit: pageSize,
    offset,
  };

  try {
    return await fetcherJSON<string[]>(`/projects/${projectId}/spans/search`, {
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
