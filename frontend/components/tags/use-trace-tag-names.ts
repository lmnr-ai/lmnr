import { useParams } from "next/navigation";
import useSWR from "swr";

import { swrFetcher } from "@/lib/api/fetch-api";

/**
 * A trace's tag names. The traces table seeds this key from its list fetch and tag edits write it directly, so a
 * cached value is used as is: no refetch per mount or window focus (every visible row would refetch on focus).
 */
export const useTraceTagNames = (traceId: string | undefined) => {
  const { projectId } = useParams();
  return useSWR<string[]>(traceId ? `/api/projects/${projectId}/traces/${traceId}/tags` : null, swrFetcher, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });
};
