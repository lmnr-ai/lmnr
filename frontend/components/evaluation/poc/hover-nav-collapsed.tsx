"use client";

import MorphCardList from "@/components/evaluation/poc/morph-card-list";
import { type EvalRow } from "@/lib/evaluation/types";

interface HoverNavCollapsedProps {
  rows?: EvalRow[];
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  fetchNextPage: () => void;
  primaryScore?: string;
  datapointId?: string;
  onSelectRow: (row: EvalRow) => void;
}

/** The always-visible collapsed sidenav: caption + card list. */
export default function HoverNavCollapsed(props: HoverNavCollapsedProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-none items-center border-b px-2 py-1">
        <span className="text-[0.7rem] text-muted-foreground">Hover to expand</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <MorphCardList {...props} />
      </div>
    </div>
  );
}
