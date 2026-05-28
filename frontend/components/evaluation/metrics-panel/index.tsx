"use client";

import { ArrowDown, ArrowUp, Grid3x3, LayoutList, Settings2, Table2, X } from "lucide-react";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import { type BinaryStyle } from "@/components/evaluation/metrics-panel/binary-viz";
import ExpandedDetail from "@/components/evaluation/metrics-panel/expanded-detail";
import GridView from "@/components/evaluation/metrics-panel/grid-view";
import ListDetailView from "@/components/evaluation/metrics-panel/list-detail-view";
import { type MetricRowDensity } from "@/components/evaluation/metrics-panel/metric-row";
import TableView from "@/components/evaluation/metrics-panel/table-view";
import { type MetricsSortDir, type MetricsSortKey } from "@/components/evaluation/metrics-panel/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

export type MetricsView = "list" | "grid" | "table";
const VIEWS: MetricsView[] = ["list", "grid", "table"];
const DENSITIES: MetricRowDensity[] = ["full", "card", "compact"];
const BINARY_STYLES: BinaryStyle[] = ["bar", "dual", "arrow"];
const SORT_KEYS: MetricsSortKey[] = ["name", "avg", "change", "count"];
const SORT_DIRS: MetricsSortDir[] = ["asc", "desc"];

interface MetricsPanelProps {
  scoreNames: string[];
  selectedScore?: string;
  setSelectedScore: (s: string) => void;
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  isLoading?: boolean;
}

export default function MetricsPanel(props: MetricsPanelProps) {
  const [view, setView] = useQueryState("metricsView", parseAsStringEnum<MetricsView>(VIEWS).withDefault("list"));
  const [density, setDensity] = useQueryState(
    "metricsDensity",
    parseAsStringEnum<MetricRowDensity>(DENSITIES).withDefault("full")
  );
  const [binaryStyle, setBinaryStyle] = useQueryState(
    "binaryStyle",
    parseAsStringEnum<BinaryStyle>(BINARY_STYLES).withDefault("dual")
  );
  const [sortKey, setSortKey] = useQueryState(
    "metricsSort",
    parseAsStringEnum<MetricsSortKey>(SORT_KEYS).withDefault("name")
  );
  const [sortDir, setSortDir] = useQueryState(
    "metricsSortDir",
    parseAsStringEnum<MetricsSortDir>(SORT_DIRS).withDefault("asc")
  );
  // Grid drill-in. Cleared when leaving grid view so users don't get stuck
  // in a detail view they can't see the toolbar for.
  const [expanded, setExpanded] = useQueryState("expandedMetric", parseAsString);

  useEffect(() => {
    if (view !== "grid" && expanded) setExpanded(null);
  }, [view, expanded, setExpanded]);

  const expandedStats = expanded ? (props.allStatistics?.[expanded] ?? null) : null;
  const expandedCStats = expanded ? (props.comparedAllStatistics?.[expanded] ?? null) : null;
  const expandedDist = expanded ? (props.allDistributions?.[expanded] ?? null) : null;
  const expandedCDist = expanded ? (props.comparedAllDistributions?.[expanded] ?? null) : null;

  const sortDisabled = view === "table"; // table has its own column-header sort
  const densityCardDisabledForView = view === "grid" || view === "table"; // 'card' density is list-only

  // Local-only toggle so the user can hide the toolbar for clean screenshots.
  // Not persisted — meant to be ephemeral.
  const [showControls, setShowControls] = useState(true);

  return (
    <>
      {showControls && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ControlGroup label="Layout">
            <Tabs value={view} onValueChange={(v) => setView(v as MetricsView)}>
              <TabsList className="h-7">
                <TabsTrigger value="list" className="px-2 gap-1.5">
                  <LayoutList className="h-3 w-3" />
                  <span className="text-[11px]">List</span>
                </TabsTrigger>
                <TabsTrigger value="grid" className="px-2 gap-1.5">
                  <Grid3x3 className="h-3 w-3" />
                  <span className="text-[11px]">Grid</span>
                </TabsTrigger>
                <TabsTrigger value="table" className="px-2 gap-1.5">
                  <Table2 className="h-3 w-3" />
                  <span className="text-[11px]">Table</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </ControlGroup>

          <ControlGroup label="Sort" disabled={sortDisabled}>
            <Tabs value={sortKey} onValueChange={(v) => setSortKey(v as MetricsSortKey)}>
              <TabsList className="h-7">
                <TabsTrigger value="name" className="px-2 text-[11px]" disabled={sortDisabled}>
                  Name
                </TabsTrigger>
                <TabsTrigger value="avg" className="px-2 text-[11px]" disabled={sortDisabled}>
                  Avg
                </TabsTrigger>
                <TabsTrigger value="change" className="px-2 text-[11px]" disabled={sortDisabled || !props.isComparison}>
                  Δ
                </TabsTrigger>
                <TabsTrigger value="count" className="px-2 text-[11px]" disabled={sortDisabled}>
                  Samples
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <button
              type="button"
              onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
              disabled={sortDisabled}
              className={cn(
                "h-7 w-7 rounded-md border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50",
                "bg-background"
              )}
              aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
            >
              {sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            </button>
          </ControlGroup>

          <ControlGroup label="Density">
            <Tabs value={density} onValueChange={(v) => setDensity(v as MetricRowDensity)}>
              <TabsList className="h-7">
                <TabsTrigger value="full" className="px-2 text-[11px]">
                  Full
                </TabsTrigger>
                <TabsTrigger value="card" className="px-2 text-[11px]" disabled={densityCardDisabledForView}>
                  Card
                </TabsTrigger>
                <TabsTrigger value="compact" className="px-2 text-[11px]">
                  Compact
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </ControlGroup>

          <ControlGroup label="Binary viz">
            <Tabs value={binaryStyle} onValueChange={(v) => setBinaryStyle(v as BinaryStyle)}>
              <TabsList className="h-7">
                <TabsTrigger value="bar" className="px-2 text-[11px]">
                  Bar
                </TabsTrigger>
                <TabsTrigger value="dual" className="px-2 text-[11px]">
                  Dual
                </TabsTrigger>
                <TabsTrigger value="arrow" className="px-2 text-[11px]">
                  Arrow
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </ControlGroup>

          <button
            type="button"
            onClick={() => setShowControls(false)}
            aria-label="Hide controls"
            className="ml-auto h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="relative border rounded-xl bg-secondary overflow-hidden h-72">
        {!showControls && (
          <button
            type="button"
            onClick={() => setShowControls(true)}
            aria-label="Show controls"
            className="absolute top-2 right-2 z-10 h-7 w-7 flex items-center justify-center rounded bg-background/60 text-muted-foreground hover:text-foreground hover:bg-background backdrop-blur-sm transition-colors"
          >
            <Settings2 className="size-3.5" />
          </button>
        )}
        {props.isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : expanded && view === "grid" ? (
          <ExpandedDetail
            name={expanded}
            statistics={expandedStats}
            comparedStatistics={expandedCStats}
            distribution={expandedDist}
            comparedDistribution={expandedCDist}
            isComparison={props.isComparison}
            binaryStyle={binaryStyle}
            onBack={() => setExpanded(null)}
          />
        ) : view === "list" ? (
          <ListDetailView {...props} density={density} binaryStyle={binaryStyle} sortKey={sortKey} sortDir={sortDir} />
        ) : view === "grid" ? (
          <GridView
            {...props}
            density={density === "card" && densityCardDisabledForView ? "full" : density}
            binaryStyle={binaryStyle}
            sortKey={sortKey}
            sortDir={sortDir}
            onExpand={(name) => setExpanded(name)}
          />
        ) : (
          <TableView {...props} density={density === "card" ? "full" : density} binaryStyle={binaryStyle} />
        )}
      </div>
    </>
  );
}

function ControlGroup({ label, disabled, children }: { label: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-2", disabled && "opacity-50")}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
