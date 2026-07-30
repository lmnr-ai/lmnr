"use client";

import { isValidNumber } from "@/lib/utils";

export interface RunPoint {
  evaluationId: string;
  /** Eval name + timestamp, for future affordances; unused while the card is display-only. */
  label: string;
  value: number | null;
  isCurrent: boolean;
}

interface HistoryCardProps {
  name: string;
  /** This datapoint's value per run in the group, oldest first. */
  points: RunPoint[];
}

const W = 300;
const H = 58; // ~20% shorter than the original 72
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

/**
 * Hover card for a selected row's score: this DATAPOINT's value across the
 * group's runs as a line, current run emphasized. Replaces the old full-width
 * per-datapoint history strip that was ripped out on dev — same data, but it
 * only exists while the user is asking for it (hover), so it costs no layout.
 */
export default function HistoryCard({ name, points }: HistoryCardProps) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // flat series renders mid-height
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 12) + 6);
  const y = (v: number) => H - 6 - ((v - min) / span) * (H - 12);

  // Break the polyline at missing runs so gaps stay visible as gaps.
  const segments: string[] = [];
  let seg: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (seg.length > 1) segments.push(seg.join(" "));
      seg = [];
    } else {
      seg.push(`${x(i)},${y(p.value)}`);
    }
  });
  if (seg.length > 1) segments.push(seg.join(" "));

  const currentValue = points.find((p) => p.isCurrent)?.value ?? undefined;
  const previous = points.filter((p) => !p.isCurrent && p.value !== null).length;

  return (
    <div className="flex w-full flex-col gap-4 rounded-[4px] border border-border bg-surface-300 px-4 py-3">
      <div className="flex flex-col gap-2">
        <p className="truncate text-xs leading-4 text-muted-foreground">{name}</p>
        <span className="text-2xl font-medium leading-6 tracking-[-0.4px] tabular-nums text-foreground">
          {isValidNumber(currentValue) ? fmt(currentValue) : "—"}
        </span>
      </div>
      <div>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {segments.map((s, i) => (
            <polyline key={i} points={s} fill="none" className="stroke-primary/50" strokeWidth={1.5} />
          ))}
          {points.map(
            (p, i) =>
              p.value !== null && (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={p.isCurrent ? 4 : 2.5}
                  className={p.isCurrent ? "fill-primary" : "fill-primary/40"}
                />
              )
          )}
        </svg>
      </div>
      <p className="text-[0.7rem] leading-3 text-muted-foreground">
        Comparing against {previous} previous run{previous === 1 ? "" : "s"} with this datapoint
      </p>
    </div>
  );
}
