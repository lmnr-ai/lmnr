"use client";

import { useCallback, useMemo, useState } from "react";

import { type AdvancedSearchValue } from "@/components/common/advanced-search";
import { StatusVariantContext } from "@/components/evaluation/columns/status-variant";
import {
  BASE_COLUMN_ORDER,
  DEFAULT_HIDDEN_COLUMNS,
  EVAL_LOCKED_COLUMNS,
  EvalStoreProvider,
} from "@/components/evaluation/store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";

import { SandboxControls } from "./controls";
import {
  DEFAULT_CONFIG,
  generateRun,
  SCENARIOS,
  SCORE_NAMES,
  type SandboxConfig,
  searchTrials,
  sortTrialsByTask,
} from "./mock-data";
import { SandboxTable } from "./sandbox-table";

const EMPTY_SEARCH: AdvancedSearchValue = { filters: [], search: "" };

export default function EvalTableSandbox() {
  const [scenarioId, setScenarioId] = useState("typical");
  const [config, setConfig] = useState<SandboxConfig>(DEFAULT_CONFIG);
  const [sort, setSort] = useState<{ by?: string; direction?: "asc" | "desc" }>({});
  const [searchValue, setSearchValue] = useState(EMPTY_SEARCH);

  const onScenario = useCallback((id: string) => {
    setScenarioId(id);
    setConfig({ ...DEFAULT_CONFIG, ...SCENARIOS.find((s) => s.id === id)?.config });
  }, []);
  const onChange = useCallback((patch: Partial<SandboxConfig>) => setConfig((c) => ({ ...c, ...patch })), []);
  const onSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => setSort(columnId ? { by: columnId, direction } : {}),
    []
  );

  // Heatmap is a view toggle, so it doesn't regenerate data or reset paging.
  const { heatmap: _heatmap, statusVariant: _statusVariant, ...dataConfig } = config;
  const dataKey = JSON.stringify([dataConfig, sort, searchValue.search]);

  // Generation is seeded, so rerunning it yields identical rows.
  const { trials, targetTrials } = useMemo(
    () => ({
      trials: sortTrialsByTask(
        searchTrials(generateRun(config, "sandbox-run-a"), searchValue.search),
        sort.by,
        sort.direction
      ),
      targetTrials: config.compare ? generateRun(config, "sandbox-run-b", 1) : [],
    }),
    [config, sort, searchValue.search]
  );

  const scoreNames = useMemo(() => SCORE_NAMES.slice(0, config.scoreCount), [config.scoreCount]);
  const defaults = useMemo(
    () => ({
      columnOrder: [...BASE_COLUMN_ORDER, ...scoreNames.map((s) => `score:${s}`)],
      columnVisibility: Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
    }),
    [scoreNames]
  );

  return (
    <StatusVariantContext.Provider value={config.statusVariant}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <SandboxControls config={config} scenarioId={scenarioId} onScenario={onScenario} onChange={onChange} />
        <EvalStoreProvider key={config.scoreCount} initialScoreNames={scoreNames}>
          <InfiniteDataTableProvider
            key={config.scoreCount}
            uniqueKey="eval-sandbox"
            defaults={defaults}
            lockedColumns={EVAL_LOCKED_COLUMNS}
          >
            <SandboxTable
              key={dataKey}
              config={config}
              trials={trials}
              targetTrials={targetTrials}
              sortBy={sort.by}
              sortDirection={sort.direction}
              onSort={onSort}
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              onHeatmapChange={(heatmap) => onChange({ heatmap })}
            />
          </InfiniteDataTableProvider>
        </EvalStoreProvider>
      </div>
    </StatusVariantContext.Provider>
  );
}
