"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { type ReactNode } from "react";

import DatapointSidebar from "@/components/evaluation/poc/datapoint-sidebar";
import HistoryBlock from "@/components/evaluation/poc/history-block";
import InsightsCard from "@/components/evaluation/poc/insights-card";
import MetricsChips from "@/components/evaluation/poc/metrics-chips";
import TraceView from "@/components/traces/trace-view";
import { type Filter } from "@/lib/actions/common/filters";
import {
  type EvalRow,
  type Evaluation as EvaluationType,
  type EvaluationScoreStatistics,
} from "@/lib/evaluation/types";

interface TraceFirstLayoutProps {
  projectId: string;
  evaluationId: string;
  evaluations: EvaluationType[];
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
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  setSort: (sortBy: string | null, sortDirection: "asc" | "desc" | null) => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (next: { filters: Filter[]; search: string }) => void;
  traceId?: string;
  datapointId?: string;
  onSelectRow: (row: EvalRow) => void;
  onSelectTrace: (traceId: string) => void;
  onCloseTrace: () => void;
  showHistory?: boolean;
  showInsights?: boolean;
  /** Full table, used for the no-trace state (same as compact's). */
  renderTable: (overrides?: { visibleColumnDefs?: ColumnDef<EvalRow>[] }) => ReactNode;
  /** Resolved label per row id (Round B). Falls back to a data preview when absent. */
  labelsById?: Record<string, string>;
}

/**
 * Shared composition for the trace-first POC variants (V2/V3/V5). No trace
 * open = the full table, full-width (same as compact) — a click opens the
 * trace and switches to the maximized trace/custom view + narrow sidebar.
 * Chip selection doubles as the sidebar's primary sort score; sorting drives
 * the existing server sort (global order, not loaded-pages).
 */
export default function TraceFirstLayout(props: TraceFirstLayoutProps) {
  const { rows, traceId, datapointId, onSelectRow, selectedScore, sortBy, sortDirection, setSort, renderTable } = props;

  const primarySortColumn = selectedScore ? `score:${selectedScore}` : null;
  const sortedByPrimary = !!primarySortColumn && sortBy === primarySortColumn;

  const handleSortDirectionChange = (direction: "asc" | "desc") => {
    if (!primarySortColumn) return;
    setSort(primarySortColumn, direction);
  };

  const handlePrimaryScoreChange = (name: string) => {
    props.onSelectScore(name);
    // Keep ordering meaningful under the new primary score.
    setSort(`score:${name}`, sortDirection ?? "asc");
  };

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden px-4 pb-4">
      <MetricsChips
        scoreNames={props.scoreNames}
        allStatistics={props.allStatistics}
        comparedAllStatistics={props.comparedAllStatistics}
        isComparison={props.isComparison}
        selectedScore={selectedScore}
        onSelectScore={handlePrimaryScoreChange}
        className="flex-none"
      />
      {!traceId ? (
        renderTable()
      ) : (
        <div className="flex flex-1 gap-2 overflow-hidden">
          <DatapointSidebar
            rows={rows}
            isLoading={props.isLoading}
            isFetching={props.isFetching}
            hasMore={props.hasMore}
            fetchNextPage={props.fetchNextPage}
            primaryScore={selectedScore}
            sortDirection={sortedByPrimary ? sortDirection : undefined}
            onSortDirectionChange={handleSortDirectionChange}
            searchValue={props.searchValue}
            onSearchChange={props.onSearchChange}
            datapointId={datapointId}
            onSelectRow={onSelectRow}
            labelsById={props.labelsById}
            topSlot={
              props.showInsights ? (
                <InsightsCard rows={rows} primaryScore={selectedScore} onSelectRow={onSelectRow} />
              ) : undefined
            }
            renderSelectedExtra={
              props.showHistory
                ? (row) =>
                    Number.isFinite(Number(row["index"])) ? (
                      <HistoryBlock
                        projectId={props.projectId}
                        index={Number(row["index"])}
                        evaluations={props.evaluations}
                        currentEvaluationId={props.evaluationId}
                        scoreNames={props.scoreNames}
                        onSelectTrace={props.onSelectTrace}
                      />
                    ) : null
                : undefined
            }
          />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <TraceView key={traceId} traceId={traceId} onClose={props.onCloseTrace} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
