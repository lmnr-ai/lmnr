"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DashboardRange {
  pastHours?: string;
  startDate?: string;
  endDate?: string;
}

interface LastRangeState {
  ranges: Record<string, DashboardRange>;
  setLastRange: (projectId: string, range: DashboardRange) => void;
}

// Last range picked on each project's dashboard; see "Dashboard date range" in docs/internal/frontend-tables.md.
export const useDashboardLastRangeStore = create<LastRangeState>()(
  persist(
    (set) => ({
      ranges: {},
      setLastRange: (projectId, range) => set((s) => ({ ranges: { ...s.ranges, [projectId]: range } })),
    }),
    { name: "dashboard-date-range" }
  )
);

const isRestorable = (range?: DashboardRange): range is DashboardRange =>
  !!range && (!!range.pastHours || (!!range.startDate && !!range.endDate));

const noopSubscribe = () => () => {};

export function useLastDashboardRange() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const saved = useDashboardLastRangeStore((s) => s.ranges[projectId]);
  const setLastRange = useDashboardLastRangeStore((s) => s.setLastRange);
  const isMounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  const hasRange = searchParams.has("pastHours") || (searchParams.has("startDate") && searchParams.has("endDate"));
  const pendingRestore = !hasRange && isRestorable(saved);

  useEffect(() => {
    if (!pendingRestore || !isRestorable(saved)) return;
    const params = new URLSearchParams(searchParams.toString());
    // One-shot flag the page strips itself; carrying it into the restored URL would re-scroll on reload.
    params.delete("newChart");
    if (saved.pastHours) {
      params.set("pastHours", saved.pastHours);
    } else if (saved.startDate && saved.endDate) {
      params.set("startDate", saved.startDate);
      params.set("endDate", saved.endDate);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }, [pendingRestore, saved, pathname, router, searchParams]);

  const onRangeChange = useCallback(
    (range: DashboardRange) => setLastRange(projectId, range),
    [projectId, setLastRange]
  );

  // False until a remembered range is back in the URL (and during SSR/hydration), so charts never
  // fetch the 24h default first.
  return { ready: isMounted && !pendingRestore, onRangeChange };
}
