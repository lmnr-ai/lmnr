"use client";

import { ArrowRight, Pencil } from "lucide-react";

import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet";

interface SignalOverviewPopoverProps {
  signal: Omit<ManageSignalForm, "id"> & { id: string };
  onTabChange: (tab: string) => void;
  onEditClick: () => void;
}

export default function SignalOverviewPopover({ signal, onTabChange, onEditClick }: SignalOverviewPopoverProps) {
  return (
    <div className="flex items-stretch gap-3">
      {/* Input column */}
      <div className="flex-1 flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground font-medium">Input</span>
        <button
          onClick={() => onTabChange("triggers")}
          className="text-xs text-left px-3 py-2 rounded-md border border-border bg-muted/50 hover:bg-muted transition-colors"
        >
          <span className="font-medium">Triggers</span>
          <p className="text-muted-foreground mt-0.5">Automatically trigger this signal</p>
        </button>
        <button
          onClick={() => onTabChange("jobs")}
          className="text-xs text-left px-3 py-2 rounded-md border border-border bg-muted/50 hover:bg-muted transition-colors"
        >
          <span className="font-medium">Jobs</span>
          <p className="text-muted-foreground mt-0.5">Run this signal on past traces</p>
        </button>
      </div>

      {/* Arrow */}
      <div className="flex items-center pt-5">
        <ArrowRight className="size-4 text-muted-foreground" />
      </div>

      {/* Definition column */}
      <div className="flex-1 flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground font-medium">Definition</span>
        <div
          className="relative flex-1 text-xs text-left px-3 py-2 rounded-md border border-border bg-background overflow-hidden cursor-pointer group"
          onClick={onEditClick}
        >
          <p className="text-muted-foreground whitespace-pre-wrap">{signal.prompt || "No prompt defined"}</p>
          {/* Bottom gradient to indicate overflow */}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          {/* Edit button */}
          <button className="absolute bottom-1.5 right-1.5 p-1 rounded bg-muted border border-border opacity-60 group-hover:opacity-100 transition-opacity">
            <Pencil className="size-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center pt-5">
        <ArrowRight className="size-4 text-muted-foreground" />
      </div>

      {/* Output column */}
      <div className="flex-1 flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground font-medium">Output</span>
        <button
          onClick={() => onTabChange("runs")}
          className="text-xs text-left px-3 py-2 rounded-md border border-border bg-muted/50 hover:bg-muted transition-colors"
        >
          <span className="font-medium">Runs</span>
          <p className="text-muted-foreground mt-0.5">All signal runs</p>
        </button>
        <button
          onClick={() => onTabChange("events")}
          className="text-xs text-left px-3 py-2 rounded-md border border-border bg-muted/50 hover:bg-muted transition-colors"
        >
          <span className="font-medium">Events</span>
          <p className="text-muted-foreground mt-0.5">Signal runs that matched your prompt</p>
        </button>
      </div>
    </div>
  );
}
