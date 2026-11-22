"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { UNCLUSTERED_ID } from "@/lib/actions/clusters/types";

/** Route segment for the unclustered events row. */
export const UNCLUSTERED_SEGMENT = "unclustered";

type Params = { projectId: string; signalId: string; clusterId?: string };

/** The cluster in the route (`/signals/[signalId]/clusters/[clusterId]`), and navigation to another one. */
export function useClusterRoute() {
  const { projectId, signalId, clusterId } = useParams<Params>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedId = clusterId === UNCLUSTERED_SEGMENT ? UNCLUSTERED_ID : (clusterId ?? null);

  const select = useCallback(
    (id: string, { replace = false }: { replace?: boolean } = {}) => {
      const segment = id === UNCLUSTERED_ID ? UNCLUSTERED_SEGMENT : id;
      const query = searchParams.toString();
      const url = `/project/${projectId}/signals/${signalId}/clusters/${segment}${query ? `?${query}` : ""}`;
      if (replace) router.replace(url);
      else router.push(url);
    },
    [projectId, signalId, searchParams, router]
  );

  return [selectedId, select] as const;
}
