"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { Feature } from "@/lib/features/features";

const PAST_90_DAYS_HOURS = String(24 * 90);

const findHorizontalScrollParent = (element: HTMLElement | null): HTMLElement | null => {
  let node = element?.parentElement ?? null;
  while (node) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowX)) return node;
    node = node.parentElement;
  }
  return null;
};

// The row spans the full table width, which is usually wider than what's on
// screen — centering against it lands off to the right. Track the scroll
// viewport instead so the empty state is centered on what the user can see.
const useVisibleWidth = (element: HTMLElement | null) => {
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    const scrollParent = findHorizontalScrollParent(element);
    if (!scrollParent) return;

    const observer = new ResizeObserver(() => setWidth(scrollParent.clientWidth));
    observer.observe(scrollParent);
    return () => observer.disconnect();
  }, [element]);

  return width;
};

export function TracesEmptyRow() {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const { project } = useProjectContext();
  const featureFlags = useFeatureFlags();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const visibleWidth = useVisibleWidth(container);

  const hasFilters = searchParams.get("filter") !== null;
  const retentionDays = featureFlags[Feature.SUBSCRIPTION] ? project?.logRetentionDays : null;
  // Hide the widen-range shortcut when the plan can't reach back that far, or
  // when we're already looking at 90 days.
  const canSearch90Days =
    (retentionDays == null || retentionDays >= 90) && searchParams.get("pastHours") !== PAST_90_DAYS_HOURS;

  const searchPast90Days = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("startDate");
    sp.delete("endDate");
    sp.delete("groupByInterval");
    sp.set("pastHours", PAST_90_DAYS_HOURS);
    sp.set("pageNumber", "0");
    router.push(`${pathName}?${sp.toString()}`);
  }, [pathName, router, searchParams]);

  const clearFilters = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("filter");
    router.push(`${pathName}?${sp.toString()}`);
  }, [pathName, router, searchParams]);

  return (
    <TableRow className="flex">
      <TableCell className="w-full h-auto p-0 rounded-b">
        <div
          ref={setContainer}
          style={{ width: visibleWidth }}
          className="sticky left-0 flex flex-col items-center gap-2 p-10"
        >
          <span className="text-sm text-secondary-foreground">No results in selected time window</span>
          <div className="flex items-center gap-2">
            {canSearch90Days && (
              <Button variant="outline" className="text-secondary-foreground" onClick={searchPast90Days}>
                Search in the past 90 days
              </Button>
            )}
            {hasFilters && (
              <Button variant="outline" className="text-secondary-foreground" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
