import { useVirtualizer } from "@tanstack/react-virtual";
import { round } from "lodash";
import { Check, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatCostIntl } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

import EvalTableSkeleton from "../evaluation-datapoints-table/eval-table-skeleton";
import { GateSummary } from "./gate-summary";
import { extractGates, type Gate, type RowGates } from "./gates";

interface GatesTableProps {
  data: EvalRow[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  fetchNextPage: () => void;
  /** Currently open datapoint (drives the trace panel + row highlight). */
  selectedId?: string;
  onRowClick: (row: EvalRow) => void;
}

// Shared grid template so the header and every data row line up.
const GRID = "36px 120px 80px minmax(0,2fr) minmax(0,2fr) 96px 104px";
const ROW_HEIGHT = 41;
const GATE_ROW_HEIGHT = 28;

type FlatItem = { kind: "row"; id: string; row: EvalRow; summary: RowGates } | { kind: "gate"; id: string; gate: Gate };

const formatValue = (v: unknown): string => {
  if (v == null) return "-";
  if (typeof v === "string") return v || "-";
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
};

const HeaderCell = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <div className={cn("truncate px-4 text-secondary-foreground", className)}>{children}</div>
);

// Trim a soft score to 2 decimals, dropping trailing zeros (0.87, 0.5, 1).
const formatScore = (v: number): string => String(Math.round(v * 100) / 100);

const GateRow = ({ gate }: { gate: Gate }) => (
  <div className="flex items-center gap-2 border-b bg-surface-900 pl-[52px] pr-4" style={{ height: GATE_ROW_HEIGHT }}>
    <span className="flex w-9 shrink-0 items-center">
      {gate.soft ? (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatScore(gate.value)}</span>
      ) : gate.passing ? (
        <Check className="text-success-bright" size={13} strokeWidth={2.5} />
      ) : (
        <X className="text-destructive" size={13} strokeWidth={2.5} />
      )}
    </span>
    <span
      className={cn(
        "truncate font-mono text-xs",
        gate.soft ? "text-muted-foreground" : gate.passing ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {gate.label}
    </span>
  </div>
);

const GatesTable = ({
  data,
  isLoading,
  isFetching,
  hasMore,
  fetchNextPage,
  selectedId,
  onRowClick,
}: GatesTableProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Flatten datapoint rows + (when expanded) their gate sub-rows into one list.
  const items = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    for (const row of data ?? []) {
      const id = row["id"] as string;
      const summary = extractGates(row);
      out.push({ kind: "row", id, row, summary });
      if (expanded.has(id)) {
        for (const gate of summary.gates) {
          out.push({ kind: "gate", id: `${id}::${gate.name}`, gate });
        }
      }
    }
    return out;
  }, [data, expanded]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i].kind === "gate" ? GATE_ROW_HEIGHT : ROW_HEIGHT),
    overscan: 12,
    getItemKey: (i) => items[i].id,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Fetch the next page once the tail of the loaded rows scrolls into view.
  const lastIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : 0;
  useEffect(() => {
    if (hasMore && !isFetching && items.length > 0 && lastIndex >= items.length - 4) {
      fetchNextPage();
    }
  }, [hasMore, isFetching, items.length, lastIndex, fetchNextPage]);

  if (isLoading) return <EvalTableSkeleton />;

  return (
    <div className="flex flex-1 flex-col self-start min-h-0 max-h-full overflow-hidden rounded border bg-secondary">
      {/* Header */}
      <div
        className="grid shrink-0 items-center rounded-t border-b bg-secondary text-xs"
        style={{ gridTemplateColumns: GRID, height: 32 }}
      >
        <HeaderCell />
        <HeaderCell>Gates</HeaderCell>
        <HeaderCell>Index</HeaderCell>
        <HeaderCell>Data</HeaderCell>
        <HeaderCell>Output</HeaderCell>
        <HeaderCell className="text-right">Duration</HeaderCell>
        <HeaderCell className="text-right">Cost</HeaderCell>
      </div>

      {/* Virtualized body */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((vi) => {
            const item = items[vi.index];
            const common = {
              key: vi.key,
              "data-index": vi.index,
              ref: virtualizer.measureElement,
              className: "absolute left-0 top-0 w-full",
              style: { transform: `translateY(${vi.start}px)` },
            } as const;

            if (item.kind === "gate") {
              return (
                <div {...common}>
                  <GateRow gate={item.gate} />
                </div>
              );
            }

            const { row, summary, id } = item;
            const isSelected = id === selectedId;
            const isOpen = expanded.has(id);

            return (
              <div {...common}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onRowClick(row)}
                  className={cn(
                    "grid cursor-pointer items-center border-b text-sm transition-colors hover:bg-muted/50",
                    isSelected && "bg-muted hover:bg-muted"
                  )}
                  style={{ gridTemplateColumns: GRID, height: ROW_HEIGHT }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                    disabled={summary.total === 0}
                    className="flex h-full items-center justify-center text-muted-foreground disabled:opacity-30"
                  >
                    <ChevronRight size={15} className={cn("transition-transform", isOpen && "rotate-90")} />
                  </button>
                  <div className="px-4">
                    <GateSummary summary={summary} />
                  </div>
                  <div className="truncate px-4 tabular-nums text-muted-foreground">{formatValue(row["index"])}</div>
                  <div className="truncate px-4">{formatValue(row["data"])}</div>
                  <div className="truncate px-4">{formatValue(row["output"])}</div>
                  <div className="truncate px-4 text-right tabular-nums text-muted-foreground">
                    {typeof row["duration"] === "number" ? `${(row["duration"] as number).toFixed(2)}s` : "-"}
                  </div>
                  <div className="truncate px-4 text-right tabular-nums text-muted-foreground">
                    {typeof row["cost"] === "number" ? formatCostIntl(round(row["cost"] as number, 5)) : "-"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GatesTable;
