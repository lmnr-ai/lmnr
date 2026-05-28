import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import BinaryViz, { type BinaryStyle } from "@/components/evaluation/metrics-panel/binary-viz";
import { type MetricRowDensity } from "@/components/evaluation/metrics-panel/metric-row";
import { isBinaryDistribution, pctChange, totalCount } from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface TableViewProps {
  scoreNames: string[];
  selectedScore?: string;
  setSelectedScore: (s: string) => void;
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  density?: MetricRowDensity;
  binaryStyle?: BinaryStyle;
}

type SortKey = "name" | "avg" | "change" | "count";
type SortDir = "asc" | "desc";

export default function TableView({
  scoreNames,
  selectedScore,
  setSelectedScore,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
  density = "full",
  binaryStyle = "dual",
}: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rows = useMemo(() => {
    const data = scoreNames.map((name) => {
      const avg = allStatistics?.[name]?.averageValue;
      const cAvg = comparedAllStatistics?.[name]?.averageValue;
      const change = isValidNumber(avg) && isValidNumber(cAvg) ? pctChange(avg, cAvg) : null;
      const count = totalCount(allDistributions?.[name] ?? null);
      const binary = isBinaryDistribution(allDistributions?.[name] ?? null);
      return { name, avg, cAvg, change, count, binary };
    });

    const mul = sortDir === "asc" ? 1 : -1;
    data.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * mul;
        case "avg":
          return ((a.avg ?? -Infinity) - (b.avg ?? -Infinity)) * mul;
        case "change":
          return ((a.change ?? -Infinity) - (b.change ?? -Infinity)) * mul;
        case "count":
          return (a.count - b.count) * mul;
      }
    });
    return data;
  }, [scoreNames, allStatistics, comparedAllStatistics, allDistributions, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  const renderTh = (k: SortKey, label: string, align: "left" | "right" = "left") => (
    <th
      onClick={() => toggleSort(k)}
      className={cn(
        "py-1 px-2 cursor-pointer select-none text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground",
        align === "left" ? "text-left" : "text-right"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );

  const showDistCol = density === "full";
  const rowPad = density === "compact" ? "py-0.5" : "py-1.5";

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-secondary z-10 border-b">
          <tr>
            {renderTh("name", "Metric")}
            {isComparison && renderTh("avg", "Compared", "right")}
            {renderTh("avg", isComparison ? "Current" : "Average", "right")}
            {isComparison && renderTh("change", "Δ", "right")}
            {renderTh("count", "Samples", "right")}
            {showDistCol && (
              <th className="py-1 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-left w-48">
                Distribution
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.name}
              onClick={() => setSelectedScore(r.name)}
              className={cn("border-t cursor-pointer hover:bg-accent/30", r.name === selectedScore && "bg-accent/50")}
            >
              <td className={cn("px-2 font-medium", rowPad)}>{r.name}</td>
              {isComparison && (
                <td className={cn("px-2 text-right tabular-nums text-muted-foreground", rowPad)}>
                  {isValidNumber(r.cAvg) ? r.cAvg!.toFixed(2) : "—"}
                </td>
              )}
              <td className={cn("px-2 text-right tabular-nums font-medium", rowPad)}>
                {isComparison && isValidNumber(r.cAvg) && isValidNumber(r.avg) && (
                  <ArrowRight className="inline h-3 w-3 mr-1 text-muted-foreground" />
                )}
                {isValidNumber(r.avg) ? r.avg!.toFixed(2) : "—"}
              </td>
              {isComparison && (
                <td
                  className={cn(
                    "px-2 text-right tabular-nums",
                    rowPad,
                    r.change === null ? "text-muted-foreground" : r.change >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {r.change === null ? "—" : `${r.change >= 0 ? "▲" : "▼"} ${Math.abs(r.change).toFixed(1)}%`}
                </td>
              )}
              <td className={cn("px-2 text-right tabular-nums text-muted-foreground", rowPad)}>{r.count}</td>
              {showDistCol && (
                <td className={cn("px-2", rowPad)}>
                  {r.binary ? (
                    <BinaryViz
                      distribution={allDistributions?.[r.name] ?? null}
                      comparedDistribution={isComparison ? (comparedAllDistributions?.[r.name] ?? null) : null}
                      size="sm"
                      style={binaryStyle}
                    />
                  ) : (
                    <MiniBars distribution={allDistributions?.[r.name] ?? null} />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniBars({ distribution }: { distribution: EvaluationScoreDistributionBucket[] | null }) {
  if (!distribution || distribution.length === 0) {
    return <div className="h-3 w-full rounded bg-muted" />;
  }
  const max = Math.max(...distribution.map((b) => b.heights[0] ?? 0), 1);
  return (
    <div className="flex h-4 items-end gap-px">
      {distribution.map((b, i) => {
        const h = b.heights[0] ?? 0;
        const pct = (h / max) * 100;
        return <div key={i} className="flex-1 rounded-sm bg-primary/70" style={{ height: `${Math.max(pct, 8)}%` }} />;
      })}
    </div>
  );
}
