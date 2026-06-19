import { type SnippetInfo } from "@/lib/actions/traces/search";
import { fetcherJSON } from "@/lib/utils";

export interface SignalEventSearchHit {
  id: string;
  /** Per-schema-field highlight snippets keyed by field name. */
  fieldSnippets: Record<string, SnippetInfo>;
}

interface SearchSignalEventsResponse {
  hits: SignalEventSearchHit[];
}

export const searchSignalEvents = async ({
  projectId,
  signalId,
  searchQuery,
  payloadFields,
  pastHours,
  startDate,
  endDate,
  limit,
}: {
  projectId: string;
  signalId: string;
  searchQuery: string;
  /** Schema field names rendered as columns. Drives the per-field snippet extracts. */
  payloadFields: string[];
  pastHours?: string;
  startDate?: string;
  endDate?: string;
  /** Set to 0 (or omit) to fall through to the backend default. */
  limit?: number;
}): Promise<SignalEventSearchHit[]> => {
  const trimmed = searchQuery.trim();
  if (!trimmed) {
    return [];
  }

  let startTime: string | undefined;
  let endTime: string | undefined;

  if (pastHours) {
    const end = new Date();
    const start = new Date(end.getTime() - parseFloat(pastHours) * 60 * 60 * 1000);
    startTime = start.toISOString();
    endTime = end.toISOString();
  } else if (startDate && endDate) {
    startTime = new Date(startDate).toISOString();
    endTime = new Date(endDate).toISOString();
  }

  const body = {
    signalId,
    searchQuery: trimmed,
    startTime,
    endTime,
    limit: limit ?? 0,
    payloadFields,
  };

  try {
    const res = await fetcherJSON<SearchSignalEventsResponse>(`/projects/${projectId}/signal-events/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Defensive: empty/malformed responses (e.g. a stale app-server binary
    // returning the previous `{ids: [...]}` shape) should degrade to "no hits"
    // rather than throwing further up the call chain.
    return Array.isArray(res?.hits) ? res.hits : [];
  } catch (error) {
    console.error("searchSignalEvents error", error);
    return [];
  }
};
