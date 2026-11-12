"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";

import { CLUSTER_WINDOW_DAYS } from "@/lib/actions/signal-clusters/types";
import { swrFetcher } from "@/lib/api/fetch-api";

export const DEFAULT_PAST_HOURS = CLUSTER_WINDOW_DAYS * 24;

/**
 * The cluster's events per day over the date range in the URL (the same params the Events tab's table reads),
 * defaulting it to the last 30 days. Until the range's series loads, falls back to the list's 30-day series.
 */
export function useClusterDaily(
  projectId: string,
  signalId: string,
  clusterId: string,
  fallback: { days: string[]; daily: number[] }
) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const hasRange = !!pastHours || !!(startDate && endDate);

  useEffect(() => {
    if (hasRange) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("pastHours", String(DEFAULT_PAST_HOURS));
    router.replace(`${pathName}?${next.toString()}`);
  }, [hasRange, searchParams, pathName, router]);

  const query = new URLSearchParams({
    ...(pastHours ? { pastHours } : startDate && endDate ? { startDate, endDate } : {}),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).toString();
  const { data } = useSWR<{ days: string[]; daily: number[] }>(
    hasRange ? `/api/projects/${projectId}/signals/${signalId}/clusters/${clusterId}/daily?${query}` : null,
    swrFetcher,
    { keepPreviousData: true }
  );
  return data ?? fallback;
}
