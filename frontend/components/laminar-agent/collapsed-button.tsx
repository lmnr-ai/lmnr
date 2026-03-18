"use client";

import { LaminarIcon } from "@/components/ui/icons";

import { useLaminarAgentStore } from "./store";

export default function CollapsedButton() {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);

  if (viewMode !== "collapsed") {
    return null;
  }

  return (
    <button
      onClick={() => setViewMode("floating")}
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center size-12 rounded-full bg-primary shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
      aria-label="Open Laminar Agent"
    >
      <LaminarIcon className="size-6" fill="hsl(var(--primary-foreground))" />
    </button>
  );
}
