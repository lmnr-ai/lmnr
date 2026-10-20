"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { collapseDiffRows, computeSplitRows, type SplitSide } from "./diff";
import SegmentSpans from "./segment-spans";

interface SplitDiffViewProps {
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
  /** Show every unchanged line instead of collapsing long runs. */
  expanded?: boolean;
}

function SideCell({ side, tone }: { side?: SplitSide; tone?: "add" | "remove" }) {
  return (
    <div
      className={cn(
        "flex min-w-0",
        !side && "bg-muted/40",
        side && tone === "add" && "bg-success/10 text-success",
        side && tone === "remove" && "bg-destructive/10 text-destructive",
        side && !tone && "text-muted-foreground"
      )}
    >
      <span className="w-12 shrink-0 select-none pr-3 text-right opacity-50">{side?.num ?? ""}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3">
        {side && (tone ? <SegmentSpans segments={side.segments} tone={tone} /> : side.segments[0]?.text || "\u00A0")}
      </span>
    </div>
  );
}

export default function SplitDiffView({ oldText, newText, oldLabel, newLabel, expanded = false }: SplitDiffViewProps) {
  const rows = useMemo(() => {
    const all = computeSplitRows(oldText, newText);
    return expanded ? all : collapseDiffRows(all);
  }, [oldText, newText, expanded]);

  return (
    <div className="font-mono text-xs leading-relaxed">
      <div className="sticky top-0 z-10 grid grid-cols-2 divide-x border-b bg-background text-muted-foreground">
        <div className="px-3 py-1.5 font-sans font-medium">{oldLabel}</div>
        <div className="px-3 py-1.5 font-sans font-medium">{newLabel}</div>
      </div>
      {rows.map((row, idx) => {
        if (row.type === "gap") {
          return (
            <div key={idx} className="px-3 py-0.5 italic text-muted-foreground/60 bg-muted/40 select-none">
              {`\u00B7\u00B7\u00B7 ${row.count} unchanged line${row.count === 1 ? "" : "s"}`}
            </div>
          );
        }
        const changed = row.type === "change";
        return (
          <div key={idx} className="grid grid-cols-2 divide-x">
            <SideCell side={row.left} tone={changed ? "remove" : undefined} />
            <SideCell side={row.right} tone={changed ? "add" : undefined} />
          </div>
        );
      })}
    </div>
  );
}
