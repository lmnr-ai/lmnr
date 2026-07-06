"use client";

import { Loader2, Search, X } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";

import SidebarRow from "@/components/evaluation/poc/sidebar-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type Filter } from "@/lib/actions/common/filters";
import { type EvalRow } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

interface DatapointSidebarProps {
  rows?: EvalRow[];
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  fetchNextPage: () => void;
  /** Row score pill + sort target — chosen via the MetricsChips row above, not here. */
  primaryScore?: string;
  /** Current server sort direction for the primary score (undefined = unsorted). */
  sortDirection?: "asc" | "desc";
  onSortDirectionChange: (direction: "asc" | "desc") => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (next: { filters: Filter[]; search: string }) => void;
  datapointId?: string;
  onSelectRow: (row: EvalRow) => void;
  /** Resolved label per row id (Round B). Falls back to a data preview when absent. */
  labelsById?: Record<string, string>;
  /** Rendered directly under the selected row (V3 history block). */
  renderSelectedExtra?: (row: EvalRow) => ReactNode;
  /** Rendered above the list header (V5 insights card). */
  topSlot?: ReactNode;
}

/**
 * Narrow datapoint list for trace-first compositions, raised a level off the
 * page background (bg-secondary) to read as its own panel. Sort direction is
 * an explicit Ascending/Descending choice — never "worst", score direction is
 * unknowable. Sorting drives the existing SERVER sort, not loaded-pages-only.
 */
export default function DatapointSidebar({
  rows,
  isLoading,
  isFetching,
  hasMore,
  fetchNextPage,
  primaryScore,
  sortDirection,
  onSortDirectionChange,
  searchValue,
  onSearchChange,
  datapointId,
  onSelectRow,
  labelsById,
  renderSelectedExtra,
  topSlot,
}: DatapointSidebarProps) {
  const [searchOpen, setSearchOpen] = useState(() => searchValue.search.length > 0);
  const listRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasMore || isFetching) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) fetchNextPage();
  }, [hasMore, isFetching, fetchNextPage]);

  const submitSearch = useCallback(
    (search: string) => onSearchChange({ filters: searchValue.filters, search }),
    [onSearchChange, searchValue.filters]
  );

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-md border bg-secondary">
      {topSlot}
      <div className="flex flex-none items-center gap-1 border-b p-1.5">
        {searchOpen ? (
          <>
            <Input
              autoFocus
              defaultValue={searchValue.search}
              placeholder="Search datapoints…"
              className="h-6 flex-1 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch(e.currentTarget.value);
                if (e.key === "Escape") setSearchOpen(false);
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={() => {
                setSearchOpen(false);
                if (searchValue.search) submitSearch("");
              }}
            >
              <X className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Select
              value={sortDirection ?? ""}
              onValueChange={(v) => onSortDirectionChange(v as "asc" | "desc")}
              disabled={!primaryScore}
            >
              <SelectTrigger className="h-6 flex-1 text-xs font-medium">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc" className="text-xs">
                  Ascending
                </SelectItem>
                <SelectItem value="desc" className="text-xs">
                  Descending
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-6 shrink-0", searchValue.search && "text-primary")}
              onClick={() => setSearchOpen(true)}
              title="Search"
            >
              <Search className="size-3.5" />
            </Button>
          </>
        )}
      </div>
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : !rows?.length ? (
          <p className="p-4 text-center text-xs text-muted-foreground">No datapoints.</p>
        ) : (
          rows.map((row) => {
            const id = String(row["id"]);
            const selected = row["id"] === datapointId;
            return (
              <div key={id}>
                <SidebarRow
                  row={row}
                  primaryScore={primaryScore}
                  selected={selected}
                  onClick={onSelectRow}
                  label={labelsById?.[id]}
                />
                {selected && renderSelectedExtra?.(row)}
              </div>
            );
          })
        )}
        {isFetching && !isLoading && (
          <div className="flex justify-center py-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </aside>
  );
}
