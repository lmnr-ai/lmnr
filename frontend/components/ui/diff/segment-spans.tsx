import { cn } from "@/lib/utils";

import { type Segment } from "./diff";

export default function SegmentSpans({ segments, tone }: { segments: Segment[]; tone: "add" | "remove" }) {
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
