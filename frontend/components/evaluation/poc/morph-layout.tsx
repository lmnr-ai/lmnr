"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Maximize2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import MetricsChips from "@/components/evaluation/poc/metrics-chips";
import MorphCardList from "@/components/evaluation/poc/morph-card-list";
import MorphPeekOverlay from "@/components/evaluation/poc/morph-peek-overlay";
import { columnsForTier, type MorphTier, tierForWidth, tierLabel } from "@/components/evaluation/poc/morph-tiers";
import TraceView from "@/components/traces/trace-view";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { type EvalRow, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

interface MorphLayoutProps {
  rows?: EvalRow[];
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  fetchNextPage: () => void;
  scoreNames: string[];
  selectedScore?: string;
  onSelectScore: (name: string) => void;
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  isComparison: boolean;
  traceId?: string;
  datapointId?: string;
  onSelectRow: (row: EvalRow) => void;
  onCloseTrace: () => void;
  visibleColumnDefs: ColumnDef<EvalRow>[];
  renderTable: (overrides?: { visibleColumnDefs?: ColumnDef<EvalRow>[] }) => ReactNode;
}

/**
 * Width-adaptive datapoint panel: dragging the split wider morphs the left
 * panel from a card list -> minimal table -> essentials table -> full table,
 * so columns never render squeezed. A peek overlay lets a narrow tier borrow
 * the full table without resizing the split.
 */
export default function MorphLayout(props: MorphLayoutProps) {
  const {
    rows,
    isLoading,
    isFetching,
    hasMore,
    fetchNextPage,
    selectedScore,
    traceId,
    datapointId,
    onSelectRow,
    onCloseTrace,
    visibleColumnDefs,
    renderTable,
  } = props;

  const [tier, setTier] = useState<MorphTier>("full");
  const [peekOpen, setPeekOpen] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Callback ref (not a mount-effect) because the panel div unmounts/remounts
  // whenever the trace opens/closes.
  const panelRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width == null) return;
      const next = tierForWidth(width);
      setTier((prev) => (prev === next ? prev : next));
      // A widen-past-"full" drop should close the peek overlay it made redundant.
      if (next === "full") setPeekOpen(false);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden px-4 pb-4">
      <MetricsChips
        scoreNames={props.scoreNames}
        allStatistics={props.allStatistics}
        comparedAllStatistics={props.comparedAllStatistics}
        isComparison={props.isComparison}
        selectedScore={selectedScore}
        onSelectScore={props.onSelectScore}
        className="flex-none"
      />
      <div className="relative flex flex-1 overflow-hidden">
        {traceId ? (
          <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
            <ResizablePanel id="morph-panel" defaultSize={420} minSize={280} className="flex overflow-hidden">
              <div
                ref={panelRef}
                className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-background"
              >
                {tier !== "full" && (
                  <div className="flex flex-none items-center justify-between border-b px-2 py-1">
                    <span className="text-[0.7rem] text-muted-foreground">{tierLabel(tier)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => setPeekOpen(true)}
                      title="Peek full table"
                    >
                      <Maximize2 className="size-3.5" />
                    </Button>
                  </div>
                )}
                <div className="flex-1 overflow-hidden">
                  {tier === "card" ? (
                    <MorphCardList
                      rows={rows}
                      isLoading={isLoading}
                      isFetching={isFetching}
                      hasMore={hasMore}
                      fetchNextPage={fetchNextPage}
                      primaryScore={selectedScore}
                      datapointId={datapointId}
                      onSelectRow={onSelectRow}
                    />
                  ) : (
                    renderTable({ visibleColumnDefs: columnsForTier(visibleColumnDefs, tier, selectedScore) })
                  )}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="z-30 bg-transparent mx-1.5" />
            <ResizablePanel id="morph-trace" minSize="30%" className="overflow-hidden">
              <div className="flex flex-col h-full overflow-hidden border rounded-md bg-background">
                <div className="flex-1 min-h-0 flex overflow-hidden">
                  <TraceView key={traceId} traceId={traceId} onClose={onCloseTrace} />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          renderTable()
        )}
        {peekOpen && <MorphPeekOverlay onClose={() => setPeekOpen(false)}>{renderTable()}</MorphPeekOverlay>}
      </div>
    </div>
  );
}
