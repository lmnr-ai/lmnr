import { SpanSearchType } from "@/lib/clickhouse/types";
import { TimeRange } from "@/lib/clickhouse/utils";

const QUICKWIT_SEARCH_BASE_URL = (process.env.QUICKWIT_SEARCH_URL || "http://localhost:7280").replace(/\/$/, "");
const QUICKWIT_SPANS_INDEX_ID = "spans";
const QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS: SpanSearchType[] = [SpanSearchType.Input, SpanSearchType.Output];

type Hit = {
  span_id: string
  trace_id: string
}

type QuickwitSearchResponse = {
  num_hits: number
  hits: Hit[]
  elapsed_time_micros: number
}

const resolveQuickwitSearchFields = (searchType?: SpanSearchType[]): string[] => {
  if (!searchType || searchType.length === 0) {
    return [...QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS];
  }

  const requested = new Set(searchType);
  const fields = QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS.filter((field) => requested.has(field));

  return fields.length > 0 ? fields : [...QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS];
};

const timeRangeToTimestamps = (timeRange: TimeRange): { start?: number; end?: number } => {
  if ("start" in timeRange && "end" in timeRange) {
    return {
      start: Math.floor(timeRange.start.getTime() / 1000),
      end: Math.floor(timeRange.end.getTime() / 1000),
    };
  }

  if ("pastHours" in timeRange) {
    if (timeRange.pastHours === "all") {
      return {};
    }
    const end = Math.floor(Date.now() / 1000);
    return {
      start: end - timeRange.pastHours * 60 * 60,
      end,
    };
  }

  return {};
};

export const searchSpans = async ({
  projectId,
  searchQuery,
  timeRange,
  searchType,
}: {
  projectId: string;
  searchQuery: string;
  timeRange: TimeRange;
  searchType?: SpanSearchType[];
}): Promise<string[]> => {
  const trimmedQuery = searchQuery.trim();
  if (!trimmedQuery) {
    return [];
  }

  const url = new URL(`${QUICKWIT_SEARCH_BASE_URL}/api/v1/${QUICKWIT_SPANS_INDEX_ID}/search`);
  const queryParts = [`project_id:${projectId}`];
  if (trimmedQuery.length > 0) {
    queryParts.push(`(${trimmedQuery})`);
  }
  url.searchParams.set("query", queryParts.join(" AND "));

  const searchFields = resolveQuickwitSearchFields(searchType);
  if (searchFields.length > 0) {
    url.searchParams.set("search_field", searchFields.join(","));
  }

  const { start, end } = timeRangeToTimestamps(timeRange);
  if (typeof start === "number") {
    url.searchParams.set("start_timestamp", start.toString());
  }
  if (typeof end === "number") {
    url.searchParams.set("end_timestamp", end.toString());
  }

  url.searchParams.set("max_hits", "1000");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Quickwit search failed: ${errorText}`);
    }

    const data: QuickwitSearchResponse = await response.json();
    return data.hits.map((hit: Hit) => hit.trace_id);
  } catch (error) {
    console.error("searchSpansQuickwit error", error);
    return [];
  }
};
