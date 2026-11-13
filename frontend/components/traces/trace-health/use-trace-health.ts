import { useParams } from "next/navigation";
import useSWR from "swr";

import { swrFetcher } from "@/lib/api/fetch-api";
import { type TraceHealthResponse } from "@/lib/trace-health/checks";

export function useTraceHealth(pastHours: number, enabled = true) {
  const { projectId } = useParams<{ projectId: string }>();
  const key = enabled ? `/api/projects/${projectId}/trace-health?pastHours=${pastHours}` : null;

  return useSWR<TraceHealthResponse>(key, swrFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
}
