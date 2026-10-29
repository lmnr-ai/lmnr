"use client";

import { type Row } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import { type AdvancedSearchValue } from "@/components/common/advanced-search";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import { buildColumnDefs, selectVisibleColumnDefs, useEvalStore } from "@/components/evaluation/store";
import { deriveStatus } from "@/components/evaluation/utils";
import { useTableConfigStore } from "@/components/ui/infinite-datatable/model/table-config-store";
import { attachComparedMeans, groupTrialsIntoTasks, isTaskGroupRow } from "@/lib/evaluation/task-groups";
import { type EvalRow } from "@/lib/evaluation/types";

import { SandboxInspector } from "./inspector";
import { type SandboxConfig } from "./mock-data";

interface SandboxTableProps {
  config: SandboxConfig;
  trials: EvalRow[];
  targetTrials: EvalRow[];
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort: (columnId: string, direction: "asc" | "desc") => void;
  searchValue: AdvancedSearchValue;
  onSearchChange: (next: AdvancedSearchValue) => void;
  onHeatmapChange: (enabled: boolean) => void;
}

/** Remount (key) on any data change: it owns the simulated paging, like useInfiniteScroll resetting on deps. */
export const SandboxTable = ({ config, trials, targetTrials, ...props }: SandboxTableProps) => {
  const scoreNames = useEvalStore((s) => s.scoreNames);
  const { customColumns, removeCustomColumn } = useTableConfigStore(
    (s) => ({ customColumns: s.config.customColumns, removeCustomColumn: s.removeCustomColumn }),
    shallow
  );
  const columnDefs = useMemo(
    () => buildColumnDefs({ scoreNames, customColumns, isShared: false }),
    [scoreNames, customColumns]
  );
  const visibleColumnDefs = useMemo(() => selectVisibleColumnDefs(columnDefs), [columnDefs]);

  const [isLoading, setIsLoading] = useState(config.fetchDelayMs > 0);
  const [isFetching, setIsFetching] = useState(false);
  const [pages, setPages] = useState(1);
  const [inspected, setInspected] = useState<EvalRow>();
  const [scoreDirections, setScoreDirections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), config.fetchDelayMs);
    return () => clearTimeout(timer);
  }, [config.fetchDelayMs]);

  const taskIds = useMemo(() => [...new Set(trials.map((t) => String(t["taskId"])))], [trials]);
  const loadedTaskIds = useMemo(() => new Set(taskIds.slice(0, pages * config.pageSize)), [taskIds, pages, config]);
  const hasMore = loadedTaskIds.size < taskIds.length;

  const loadedTrials = useMemo(() => {
    const page = trials.filter((t) => loadedTaskIds.has(String(t["taskId"])));
    if (!config.compare) return page;
    const comparableIds = columnDefs.filter((c) => c.meta?.comparable).map((c) => c.id!);
    return attachComparedMeans(page, targetTrials, comparableIds);
  }, [trials, loadedTaskIds, config.compare, targetTrials, columnDefs]);

  // The real page gets this from /stats, which counts every Trial, not just loaded pages.
  const runningTrials = useMemo(() => trials.filter((t) => deriveStatus(t) === "pending").length, [trials]);

  const taskRows = useMemo(() => groupTrialsIntoTasks(loadedTrials), [loadedTrials]);

  const scoreRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const name of scoreNames) {
      const values = loadedTrials
        .flatMap((r) => [r[`score:${name}`], config.compare ? r[`compared:score:${name}`] : undefined])
        .filter((v): v is number => typeof v === "number" && !isNaN(v));
      if (values.length > 0) ranges[name] = { min: Math.min(...values), max: Math.max(...values) };
    }
    return ranges;
  }, [loadedTrials, scoreNames, config.compare]);

  const fetchNextPage = useCallback(() => {
    if (isFetching || !hasMore) return;
    setIsFetching(true);
    setTimeout(() => {
      setPages((p) => p + 1);
      setIsFetching(false);
    }, config.fetchDelayMs);
  }, [isFetching, hasMore, config.fetchDelayMs]);

  const handleRowClick = useCallback((row: Row<EvalRow>) => {
    if (isTaskGroupRow(row.original)) row.toggleExpanded();
    setInspected(row.original);
  }, []);

  const toggleScoreDirection = useCallback(
    (name: string) => setScoreDirections((d) => ({ ...d, [name]: !(d[name] ?? true) })),
    []
  );

  return (
    <>
      <div className="flex min-w-0 flex-1 overflow-hidden p-4">
        <EvaluationDatapointsTable
          data={taskRows}
          isLoading={config.forceLoading || isLoading}
          isFetching={isFetching}
          hasMore={hasMore}
          fetchNextPage={fetchNextPage}
          columnDefs={columnDefs}
          visibleColumnDefs={visibleColumnDefs}
          isComparison={config.compare}
          scoreRanges={scoreRanges}
          runningTrials={config.compare ? undefined : runningTrials}
          datapointId={inspected?.["id"] as string | undefined}
          handleRowClick={handleRowClick}
          heatmapEnabled={config.heatmap}
          onHeatmapEnabledChange={props.onHeatmapChange}
          onDeleteCustomColumn={(id) => removeCustomColumn(id.replace("custom:", ""))}
          scoreDirections={scoreDirections}
          onToggleScoreDirection={toggleScoreDirection}
          sortBy={props.sortBy}
          sortDirection={props.sortDirection}
          onSort={props.onSort}
          searchValue={props.searchValue}
          onSearchChange={props.onSearchChange}
        />
      </div>
      <SandboxInspector
        row={inspected}
        trialCount={trials.length}
        taskCount={taskIds.length}
        loadedTaskCount={loadedTaskIds.size}
      />
    </>
  );
};
