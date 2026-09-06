// Stands where the strip would be when the window has no clusters to draw.
//
// Not the skeleton: the skeleton says "wait", and this says "there is nothing to
// wait for yet" — clustering runs behind ingestion, so a new or quiet signal sits
// here for a while and the difference is the whole message.
"use client";

import { cn } from "@/lib/utils";

export default function ClusterIcicleEmpty({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 items-center justify-center rounded border bg-secondary px-4 py-6 text-center text-xs text-muted-foreground",
        className
      )}
    >
      Clusters will appear here as more events arrive
    </div>
  );
}
