"use client";

import { type PropsWithChildren } from "react";

import PreviewTitle from "@/components/dashboards/editor/preview-title";
import TimeControls from "@/components/dashboards/editor/time-controls";

/**
 * Time range above a 3:2 card, up to 900px wide like production. The width is also capped by the
 * viewport height (290px ≈ the page chrome, time range and margins around the card), so the card keeps
 * its ratio on short screens instead of overflowing; 320px keeps it usable on a landscape phone.
 */
export default function ChartPreviewPane({ name, children }: PropsWithChildren<{ name: string }>) {
  return (
    <div className="flex h-full min-w-0 flex-col items-center overflow-auto p-4 xl:p-6">
      <div className="my-auto flex w-[min(100%,900px,max(320px,calc((100dvh_-_290px)_*_1.5)))] flex-col gap-3">
        <TimeControls />
        <div className="flex aspect-[3/2] w-full flex-col items-center overflow-hidden rounded-lg border bg-surface-up p-4 shadow-sm">
          <PreviewTitle name={name} />
          {children}
        </div>
      </div>
    </div>
  );
}
