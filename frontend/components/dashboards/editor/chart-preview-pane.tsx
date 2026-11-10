"use client";

import { type PropsWithChildren } from "react";

import PreviewTitle from "@/components/dashboards/editor/preview-title";
import TimeControls from "@/components/dashboards/editor/time-controls";

// A dot grid marks the pane as a canvas, so the room around a fixed-ratio card reads as intentional.
const CANVAS_STYLE = {
  backgroundImage:
    "radial-gradient(color-mix(in oklab, var(--color-muted-foreground) 35%, transparent) 1px, transparent 1px)",
  backgroundSize: "16px 16px",
};

export default function ChartPreviewPane({ name, children }: PropsWithChildren<{ name: string }>) {
  return (
    <div className="flex h-full min-w-0 justify-center overflow-auto p-6" style={CANVAS_STYLE}>
      <div className="my-auto flex w-full max-w-[900px] flex-col gap-3">
        <TimeControls />
        <div className="flex aspect-[4/3] w-full flex-col items-center overflow-hidden rounded-lg border bg-background p-4 shadow-sm">
          <PreviewTitle name={name} />
          {children}
        </div>
      </div>
    </div>
  );
}
