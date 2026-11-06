import { searchSpans } from "@/lib/actions/traces/search";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";

interface SessionSearchInput {
  projectId: string;
  search?: string | null;
  searchIn: string[];
  pastHours?: string;
  startTime?: string;
  endTime?: string;
}

/**
 * Trace ids whose spans match the full-text search; sessions are then narrowed to those traces.
 * `noMatches` means a search ran and found nothing, so callers can short-circuit.
 */
export async function resolveSessionSearch({
  projectId,
  search,
  searchIn,
  pastHours,
  startTime,
  endTime,
}: SessionSearchInput): Promise<{ traceIds: string[]; noMatches: boolean }> {
  if (!search) return { traceIds: [], noMatches: false };
  const hits = await searchSpans({
    projectId,
    searchQuery: search,
    timeRange: getTimeRange(pastHours, startTime, endTime),
    searchType: searchIn as SpanSearchType[],
  });
  const traceIds = [...new Set(hits.map((hit) => hit.trace_id))];
  return { traceIds, noMatches: traceIds.length === 0 };
}
