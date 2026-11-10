"use client";

import { type PropsWithChildren } from "react";

import PreviewTitle from "@/components/dashboards/editor/preview-title";
import TimeControls from "@/components/dashboards/editor/time-controls";

// A dot grid marks the pane as a canvas around the card.
// The card is 4:3 until the pane is too short; then max-h-full lets it shrink in height instead of scrolling.
const CANVAS_STYLE = {
  backgroundImage:
    "radial-gradient(color-mix(in oklab, var(--color-muted-foreground) 35%, transparent) 1px, transparent 1px)",
  backgroundSize: "16px 16px",
};

export default function ChartPreviewPane({ name, children }: PropsWithChildren<{ name: string }>) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-auto p-4 xl:p-6" style={CANVAS_STYLE}>
      <div className="my-auto flex max-h-full w-full flex-col gap-3">
        <TimeControls />
        <div className="flex aspect-[4/3] min-h-48 w-full flex-col items-center overflow-hidden rounded-lg border bg-background p-4 shadow-sm">
          <PreviewTitle name={name} />
          {children}
        </div>
      </div>
    </div>
  );
}
