"use client";

import { type PropsWithChildren } from "react";

import PreviewTitle from "@/components/dashboards/editor/preview-title";

export default function ChartPreviewPane({ name, children }: PropsWithChildren<{ name: string }>) {
  return (
    <div className="flex h-full min-w-0 justify-center overflow-auto p-6">
      <div className="my-auto flex aspect-[3/2] w-full max-w-[900px] flex-col items-center overflow-hidden rounded-lg border bg-background p-4">
        <PreviewTitle name={name} />
        {children}
      </div>
    </div>
  );
}
