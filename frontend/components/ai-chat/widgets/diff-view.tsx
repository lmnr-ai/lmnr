"use client";

import { diffWords } from "diff";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export interface DiffViewData {
  leftLabel: string;
  rightLabel: string;
  leftText: string;
  rightText: string;
}

export function DiffView({ data }: { data: DiffViewData }) {
  const [mode, setMode] = useState<"inline" | "side">("inline");

  const changes = useMemo(() => diffWords(data.leftText, data.rightText), [data.leftText, data.rightText]);

  const addedCount = changes.filter((c) => c.added).length;
  const removedCount = changes.filter((c) => c.removed).length;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-sm">Diff</span>
          <span className="text-emerald-500">+{addedCount}</span>
          <span className="text-destructive">-{removedCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode("inline")}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded",
              mode === "inline" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Inline
          </button>
          <button
            onClick={() => setMode("side")}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded",
              mode === "side" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Side
          </button>
        </div>
      </div>

      {/* Labels */}
      {mode === "side" ? (
        <div className="grid grid-cols-2 text-[10px] text-muted-foreground border-b">
          <div className="px-3 py-1 border-r bg-red-500/5">{data.leftLabel}</div>
          <div className="px-3 py-1 bg-emerald-500/5">{data.rightLabel}</div>
        </div>
      ) : (
        <div className="flex gap-3 px-3 py-1 text-[10px] text-muted-foreground border-b">
          <span>
            <span className="text-destructive">---</span> {data.leftLabel}
          </span>
          <span>
            <span className="text-emerald-500">+++</span> {data.rightLabel}
          </span>
        </div>
      )}

      {/* Diff content */}
      {mode === "inline" ? (
        <div className="px-3 py-2 text-xs font-mono leading-relaxed max-h-48 overflow-auto minimal-scrollbar">
          {changes.map((change, i) => (
            <span
              key={i}
              className={cn(
                change.added && "bg-emerald-500/20 text-emerald-400",
                change.removed && "bg-red-500/20 text-red-400 line-through",
                !change.added && !change.removed && "text-foreground/70"
              )}
            >
              {change.value}
            </span>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 text-xs font-mono max-h-48 overflow-auto minimal-scrollbar">
          <div className="px-3 py-2 border-r bg-red-500/5 leading-relaxed">
            {changes
              .filter((c) => !c.added)
              .map((change, i) => (
                <span key={i} className={cn(change.removed ? "bg-red-500/20 text-red-400" : "text-foreground/70")}>
                  {change.value}
                </span>
              ))}
          </div>
          <div className="px-3 py-2 bg-emerald-500/5 leading-relaxed">
            {changes
              .filter((c) => !c.removed)
              .map((change, i) => (
                <span
                  key={i}
                  className={cn(change.added ? "bg-emerald-500/20 text-emerald-400" : "text-foreground/70")}
                >
                  {change.value}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
