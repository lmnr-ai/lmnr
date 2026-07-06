"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import HoverNavCollapsed from "@/components/evaluation/poc/hover-nav-collapsed";
import HoverNavExpanded from "@/components/evaluation/poc/hover-nav-expanded";
import HoverNavFlyout from "@/components/evaluation/poc/hover-nav-flyout";
import HoverNavSpine, { type HoverNavMode } from "@/components/evaluation/poc/hover-nav-spine";
import MetricsChips from "@/components/evaluation/poc/metrics-chips";
import { useHoverIntent } from "@/components/evaluation/poc/use-hover-intent";
import TraceView from "@/components/traces/trace-view";
import { type EvalRow, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

export type { HoverNavMode };

interface HoverNavLayoutProps {
  mode: HoverNavMode;
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
  renderTable: () => ReactNode;
}

const SPINE_WIDTH = 280;

/**
 * Table-as-sidenav, three ways: the sidenav sits at a permanent 280px gutter
 * (plain flex, never a ResizablePanelGroup) so the trace never reflows.
 * Hovering expands an overlay to ~80% of the content area, floating over the
 * trace. Reveal/pin grow the spine itself (HoverNavSpine); flyout keeps the
 * spine static and slides a second surface out beside it (HoverNavFlyout).
 */
export default function HoverNavLayout(props: HoverNavLayoutProps) {
  const { mode, rows, traceId, datapointId, onSelectRow, onCloseTrace, renderTable, selectedScore } = props;

  const { hovering, onMouseEnter, onMouseLeave, collapseNow } = useHoverIntent();
  const [pinned, setPinned] = useState(false);
  const expanded = mode === "pin" ? hovering || pinned : hovering;

  // Mount the (virtualized) table lazily on first expand, then keep it mounted
  // and just toggle visibility — remounting mid-animation would jank.
  const [everExpanded, setEverExpanded] = useState(false);
  useEffect(() => {
    if (expanded) setEverExpanded(true);
  }, [expanded]);

  const collapseAll = () => {
    collapseNow();
    setPinned(false);
  };

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapseAll();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Auto-select the first row so the trace is never empty; a user-initiated
  // close isn't fought (one-shot, mirrors trace-first-layout).
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || traceId || !rows?.length) return;
    autoSelected.current = true;
    onSelectRow(rows[0]);
  }, [rows, traceId, onSelectRow]);

  const collapsed = (
    <HoverNavCollapsed
      rows={rows}
      isLoading={props.isLoading}
      isFetching={props.isFetching}
      hasMore={props.hasMore}
      fetchNextPage={props.fetchNextPage}
      primaryScore={selectedScore}
      datapointId={datapointId}
      onSelectRow={onSelectRow}
    />
  );
  const expandedTable = (
    <HoverNavExpanded
      onRowSelected={collapseAll}
      showPin={mode === "pin"}
      pinned={pinned}
      onTogglePin={() => setPinned((p) => !p)}
    >
      {renderTable()}
    </HoverNavExpanded>
  );

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
      {traceId ? (
        <div className="relative flex flex-1 overflow-hidden">
          {/* Invisible gutter: the trace's left edge is pinned here regardless of overlay state. */}
          <div className="w-[280px] shrink-0" />
          <div className="ml-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <TraceView key={traceId} traceId={traceId} onClose={onCloseTrace} />
            </div>
          </div>
          <HoverNavSpine
            mode={mode}
            width={SPINE_WIDTH}
            expanded={expanded}
            everExpanded={everExpanded}
            collapsed={collapsed}
            expandedTable={expandedTable}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          />
          {mode === "flyout" && everExpanded && (
            <HoverNavFlyout
              spineWidth={SPINE_WIDTH}
              expanded={expanded}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
            >
              {expandedTable}
            </HoverNavFlyout>
          )}
        </div>
      ) : (
        renderTable()
      )}
    </div>
  );
}
