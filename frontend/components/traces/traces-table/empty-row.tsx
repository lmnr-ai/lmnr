"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import SearchWiderRangeButton from "@/components/ui/date-range-filter/search-wider-range-button";
import { type DateRange } from "@/components/ui/date-range-filter/utils";
import { TableCell, TableRow } from "@/components/ui/table";

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

interface TracesEmptyRowProps {
  hasFilters: boolean;
}

export function TracesEmptyRow({ hasFilters }: TracesEmptyRowProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const visibleWidth = useVisibleWidth(container);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const searchWiderRange = useCallback(
    (range: DateRange) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("startDate");
      sp.delete("endDate");
      sp.delete("groupByInterval");
      sp.set("pastHours", range.value);
      sp.set("pageNumber", "0");
      router.push(`${pathName}?${sp.toString()}`);
    },
    [pathName, router, searchParams]
  );

  const clearFilters = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("filter");
    sp.delete("textSearch");
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
            {!hasFilters && (
              <SearchWiderRangeButton
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                onSelect={searchWiderRange}
              />
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
