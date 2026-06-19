"use client";

import { useMemo } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { collapseDiffRows, computeDiffRows, type Segment } from "./diff";

interface DiffViewProps {
  oldText: string;
  newText: string;
}

function SegmentSpans({ segments, tone }: { segments: Segment[]; tone: "add" | "remove" }) {
  return (
    <>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            seg.highlight && tone === "add" && "bg-success/30 rounded-sm",
            seg.highlight && tone === "remove" && "bg-destructive/30 rounded-sm"
          )}
        >
          {seg.text || "\u00A0"}
        </span>
      ))}
    </>
  );
}

export default function DiffView({ oldText, newText }: DiffViewProps) {
  const rows = useMemo(() => collapseDiffRows(computeDiffRows(oldText, newText)), [oldText, newText]);

  return (
    <ScrollArea className="rounded-md border bg-muted/30 max-h-96 [&>div]:max-h-96">
      <div className="font-mono text-xs leading-relaxed">
        {rows.map((row, idx) => {
          if (row.type === "gap") {
            return (
              <div key={idx} className="px-3 py-0.5 italic text-muted-foreground/60 bg-muted/40 select-none">
                {`\u00B7\u00B7\u00B7 ${row.count} unchanged line${row.count === 1 ? "" : "s"}`}
              </div>
            );
          }

          if (row.type === "equal") {
            return (
              <div key={idx} className="px-3 whitespace-pre-wrap break-words text-muted-foreground">
                <span className="select-none mr-2 opacity-60">{"\u00A0"}</span>
                {row.text || "\u00A0"}
              </div>
            );
          }

          const isAdd = row.type === "add";
          return (
            <div
              key={idx}
              className={cn(
                "px-3 whitespace-pre-wrap break-words",
                isAdd ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
              )}
            >
              <span className="select-none mr-2 opacity-60">{isAdd ? "+" : "-"}</span>
              <SegmentSpans segments={row.segments} tone={row.type} />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
