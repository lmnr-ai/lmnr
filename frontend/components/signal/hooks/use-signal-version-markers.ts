"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";

import { type TimeSeriesMarker } from "@/components/charts/time-series-chart/types";
import { signalVersionHref } from "@/components/signal/hooks/signal-tab-search";
import { useSignalStoreContext } from "@/components/signal/store";
import { swrFetcher } from "@/lib/utils";

export const signalVersionsKey = (projectId: string, signalId: string): string =>
  `/api/projects/${projectId}/signals/${signalId}/versions`;

/** Dashed "definition changed here" lines. v1 is skipped — that's the signal's creation. */
export const useSignalVersionMarkers = (): TimeSeriesMarker[] => {
  const { projectId } = useParams();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const signalId = useSignalStoreContext((state) => state.signal.id);

  const { data } = useSWR<{ items: { version: number; createdAt: string }[] }>(
    projectId && signalId ? signalVersionsKey(String(projectId), signalId) : null,
    swrFetcher
  );

  const search = searchParams.toString();

  return useMemo(
    () =>
      (data?.items ?? [])
        .filter((version) => version.version > 1)
        .map((version) => ({
          timestamp: version.createdAt,
          label: `v${version.version}`,
          href: signalVersionHref(pathName, search, version.version),
        })),
    [data?.items, pathName, search]
  );
};
