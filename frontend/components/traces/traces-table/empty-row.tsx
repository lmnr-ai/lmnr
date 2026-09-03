"use client";

import { differenceInHours } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getNextQuickRange } from "@/components/ui/date-range-filter/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { Feature } from "@/lib/features/features";

const findHorizontalScrollParent = (element: HTMLElement | null): HTMLElement | null => {
  let node = element?.parentElement ?? null;
  while (node) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowX)) return node;
    node = node.parentElement;
  }
  return null;
};

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
  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const retentionDays = featureFlags[Feature.SUBSCRIPTION] ? project?.logRetentionDays : null;
  const maxHours = retentionDays != null ? retentionDays * 24 : undefined;

  const currentHours = pastHours
    ? parseInt(pastHours, 10)
    : startDate && endDate
      ? differenceInHours(new Date(endDate), new Date(startDate))
      : 24;
  const nextRange = Number.isNaN(currentHours) ? undefined : getNextQuickRange(currentHours, maxHours);

  const searchWiderRange = useCallback(() => {
    if (!nextRange) return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("startDate");
    sp.delete("endDate");
    sp.delete("groupByInterval");
    sp.set("pastHours", nextRange.value);
    sp.set("pageNumber", "0");
    router.push(`${pathName}?${sp.toString()}`);
  }, [nextRange, pathName, router, searchParams]);

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
          <span className="text-sm text-secondary-foreground">No traces in this time range</span>
          <div className="flex items-center gap-2">
            {nextRange && (
              <Button variant="outline" className="text-secondary-foreground" onClick={searchWiderRange}>
                Search last {nextRange.name.replace(/^1 /, "")}
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
