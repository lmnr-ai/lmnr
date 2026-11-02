"use client";

import { type PropsWithChildren } from "react";

import PreviewTitle from "@/components/dashboards/editor/preview-title";
import TimeControls from "@/components/dashboards/editor/time-controls";

export default function ChartPreviewPane({ name, children }: PropsWithChildren<{ name: string }>) {
  return (
    <div className="flex h-full min-w-0 justify-center overflow-auto px-[40px]">
      <div className="my-auto flex w-full max-w-[900px] flex-col items-center gap-4 pb-[40px]">
        <div className="w-full">
          <TimeControls />
        </div>
        <div className="flex aspect-[3/2] w-full flex-col items-center overflow-hidden rounded border border-dashed bg-secondary p-4">
          <PreviewTitle name={name} />
          {children}
        </div>
      </div>
    </div>
  );
}
