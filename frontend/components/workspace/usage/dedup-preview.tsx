"use client";

// TEMPORARY: hardcoded scenarios for eyeballing the dedup-savings row. Delete before merging.
import { GB_IN_BYTES } from "@/components/workspace/usage/utils";
import { type UsageBreakdown, type WorkspaceStats } from "@/lib/actions/usage/types";
import { cn } from "@/lib/utils";

export type DedupPreviewCase = "live" | "under" | "middle" | "over";

// Billed / saved GB, picked against Pro's 10 GB included.
const PRESETS: Record<Exclude<DedupPreviewCase, "live">, { billedGB: number; savedGB: number }> = {
  under: { billedGB: 2.4, savedGB: 1.1 },
  middle: { billedGB: 8.6, savedGB: 3.9 },
  over: { billedGB: 14.2, savedGB: 6.5 },
};

const CASES: DedupPreviewCase[] = ["live", "under", "middle", "over"];

export const applyDedupPreview = (
  preview: DedupPreviewCase,
  stats: WorkspaceStats | null,
  breakdown: UsageBreakdown | undefined
): { stats: WorkspaceStats | null; breakdown: UsageBreakdown | undefined } => {
  if (preview === "live") return { stats, breakdown };
  const { billedGB, savedGB } = PRESETS[preview];
  const weights = breakdown?.days.map((_, i) => 1 + 0.5 * Math.sin(i * 1.7)) ?? [];
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  return {
    stats: stats && { ...stats, gbUsedThisMonth: billedGB },
    breakdown: breakdown && {
      ...breakdown,
      days: breakdown.days.map((day, i) => ({
        ...day,
        bytes: (billedGB * GB_IN_BYTES * weights[i]) / totalWeight,
        compressedBytes: (savedGB * GB_IN_BYTES * weights[i]) / totalWeight,
      })),
    },
  };
};

interface DedupPreviewSwitcherProps {
  value: DedupPreviewCase;
  onChange: (value: DedupPreviewCase) => void;
}

export default function DedupPreviewSwitcher({ value, onChange }: DedupPreviewSwitcherProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Preview (temporary)</span>
      {CASES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "rounded-md border px-2 py-1 capitalize",
            c === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
