"use client";

import { type EvalRow } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

/** Type guard for unknown row values (lib's isValidNumber only takes number|undefined). */
export const isScoreValue = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

interface SidebarRowProps {
  row: EvalRow;
  primaryScore?: string;
  selected: boolean;
  onClick: (row: EvalRow) => void;
  /** Resolved label value (Round B: LLM field extraction). Falls back to a truncated data preview when absent. */
  label?: string;
}

const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

/** Flatten a datapoint's `data` into a one-line preview snippet. */
export function dataPreview(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data.replace(/\s+/g, " ").trim();
  try {
    return JSON.stringify(data)
      .replace(/[{}"[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return String(data);
  }
}

/**
 * Two-line narrow row: identity (#index + status) + primary-score badge on top,
 * data snippet below. The badge is deliberately value-neutral (no good/bad
 * coloring) — score direction is unknowable (accuracy vs cost-like metrics), so
 * ordering, not color, communicates rank. Missing score = distinct "—" badge.
 * Selected reserves a 2px left gutter always (colored only when selected) so
 * toggling selection never shifts the row's content by a border width.
 */
export default function SidebarRow({ row, primaryScore, selected, onClick, label }: SidebarRowProps) {
  const index = row["index"] as number | undefined;
  const status = row["status"] as string | undefined;
  const value = primaryScore ? row[`score:${primaryScore}`] : undefined;
  const hasScore = isScoreValue(value);
  const preview = label ?? dataPreview(row["data"]);

  return (
    <button
      onClick={() => onClick(row)}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b border-l-2 px-2.5 py-1 text-left transition-colors",
        selected ? "border-l-primary bg-primary/10" : "border-l-transparent hover:bg-muted/40"
      )}
    >
      <span className="flex items-center gap-1.5">
        {status === "error" && <span className="size-1.5 shrink-0 rounded-full bg-destructive" title="error" />}
        <span className="text-xs font-medium tabular-nums text-secondary-foreground">#{index ?? "?"}</span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[0.7rem] font-medium tabular-nums",
            hasScore
              ? "bg-muted/50 text-foreground"
              : "border border-dashed border-muted-foreground/40 text-muted-foreground"
          )}
          title={primaryScore}
        >
          {hasScore ? fmtScore(value) : "—"}
        </span>
      </span>
      <span className="truncate text-[0.7rem] leading-4 text-muted-foreground">{preview || "(no data)"}</span>
    </button>
  );
}
