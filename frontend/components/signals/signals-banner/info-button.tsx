"use client";

import { Info } from "lucide-react";

import { useSignalsBannerStore } from "./store";

export function SignalsBannerInfoButton() {
  const { show } = useSignalsBannerStore();

  return (
    <button
      onClick={show}
      className="inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors size-6"
      aria-label="Show signals info"
    >
      <Info className="size-3.5" />
    </button>
  );
}
