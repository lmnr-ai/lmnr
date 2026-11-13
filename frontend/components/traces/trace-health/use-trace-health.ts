import { useParams } from "next/navigation";
import useSWR from "swr";

import { swrFetcher } from "@/lib/api/fetch-api";
import { type TraceHealthResponse } from "@/lib/trace-health/checks";

/** The button and dialog share this SWR key, so opening the dialog reuses the page-load fetch. */
export function useTraceHealth() {
  const { projectId } = useParams<{ projectId: string }>();
  return useSWR<TraceHealthResponse>(`/api/projects/${projectId}/trace-health`, swrFetcher, {
    revalidateOnFocus: false,
  });
}
