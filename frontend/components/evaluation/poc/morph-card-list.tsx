"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useRef } from "react";

import SidebarRow from "@/components/evaluation/poc/sidebar-row";
import { type EvalRow } from "@/lib/evaluation/types";

interface MorphCardListProps {
  rows?: EvalRow[];
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  fetchNextPage: () => void;
  primaryScore?: string;
  datapointId?: string;
  onSelectRow: (row: EvalRow) => void;
}

/** Narrowest morph tier: a scrollable card list, same rows as the sidebar variants. */
export default function MorphCardList({
  rows,
  isLoading,
  isFetching,
  hasMore,
  fetchNextPage,
  primaryScore,
  datapointId,
  onSelectRow,
}: MorphCardListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasMore || isFetching) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) fetchNextPage();
  }, [hasMore, isFetching, fetchNextPage]);

  return (
    <div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto">
      {!rows?.length ? (
        <p className="p-4 text-center text-xs text-muted-foreground">{isLoading ? "Loading…" : "No datapoints."}</p>
      ) : (
        rows.map((row) => (
          <SidebarRow
            key={String(row["id"])}
            row={row}
            primaryScore={primaryScore}
            selected={row["id"] === datapointId}
            onClick={onSelectRow}
          />
        ))
      )}
      {isFetching && (
        <div className="flex justify-center py-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
