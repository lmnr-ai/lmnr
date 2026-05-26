import { fetcherJSON } from "@/lib/utils";

interface SearchSignalEventsResponse {
  ids: string[];
}

export const searchSignalEventIds = async ({
  projectId,
  signalId,
  searchQuery,
  pastHours,
  startDate,
  endDate,
  limit,
}: {
  projectId: string;
  signalId: string;
  searchQuery: string;
  pastHours?: string;
  startDate?: string;
  endDate?: string;
  /** Set to 0 (or omit) to fall through to the backend default. */
  limit?: number;
}): Promise<string[]> => {
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
  };

  try {
    const res = await fetcherJSON<SearchSignalEventsResponse>(`/projects/${projectId}/signal-events/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ids;
  } catch (error) {
    console.error("searchSignalEventIds error", error);
    return [];
  }
};
