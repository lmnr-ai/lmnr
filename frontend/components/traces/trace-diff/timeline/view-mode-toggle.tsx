"use client";

import { List, Timer } from "lucide-react";

import { cn } from "@/lib/utils";

import { useTraceDiffStore } from "../trace-diff-store";

const ViewModeToggle = () => {
  const { viewMode, setViewMode, rightTrace } = useTraceDiffStore((s) => ({
    viewMode: s.viewMode,
    setViewMode: s.setViewMode,
    rightTrace: s.rightTrace,
  }));

  // Show toggle once both traces are loaded (right trace exists)
  if (!rightTrace) return null;

  return (
    <div className="flex items-center rounded-md border border-secondary-foreground/20 overflow-hidden">
      <button
        className={cn(
          "flex items-center gap-1 px-2 py-1 text-xs transition-colors",
          viewMode === "list" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/50"
        )}
        onClick={() => setViewMode("list")}
      >
        <List className="size-3" />
        List
      </button>
      <button
        className={cn(
          "flex items-center gap-1 px-2 py-1 text-xs transition-colors",
          viewMode === "timeline"
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:bg-secondary/50"
        )}
        onClick={() => setViewMode("timeline")}
      >
        <Timer className="size-3" />
        Timeline
      </button>
    </div>
  );
};

export default ViewModeToggle;
