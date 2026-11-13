import { useParams } from "next/navigation";
import useSWR from "swr";

import { swrFetcher } from "@/lib/api/fetch-api";
import { type TraceHealthResponse, type TraceHealthTimeRange } from "@/lib/trace-health/checks";

export function useTraceHealth(range: TraceHealthTimeRange, enabled = true) {
  const { projectId } = useParams<{ projectId: string }>();
  const query = new URLSearchParams(
    Object.entries(range).filter((entry): entry is [string, string] => !!entry[1])
  ).toString();
  const key = enabled ? `/api/projects/${projectId}/trace-health?${query}` : null;

  return useSWR<TraceHealthResponse>(key, swrFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
}
