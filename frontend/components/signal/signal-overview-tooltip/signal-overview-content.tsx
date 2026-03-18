"use client";

import { ArrowRight, Pencil } from "lucide-react";

import TabButton from "@/components/signal/signal-overview-tooltip/tab-button";
import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet";

interface SignalOverviewContentProps {
  signal: Omit<ManageSignalForm, "id"> & { id: string };
  activeTab: string;
  onTabChange: (tab: string) => void;
  onEditClick: () => void;
}

export default function SignalOverviewContent({
  signal,
  activeTab,
  onTabChange,
  onEditClick,
}: SignalOverviewContentProps) {
  return (
    <div className="flex items-stretch gap-3 px-5 py-4">
      {/* Input column */}
      <div className="flex-1 flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Input</span>
        <div className="flex flex-col gap-1">
          <TabButton
            tab="jobs"
            activeTab={activeTab}
            onClick={() => onTabChange("jobs")}
            title="Jobs"
            description="Run this signal on past traces"
          />
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center pt-6">
        <ArrowRight className="size-4 text-muted-foreground" />
      </div>

      {/* Definition column */}
      <div className="flex-1 flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Definition</span>
        <div className="relative flex-1 min-h-0">
          <div
            onClick={onEditClick}
            className="absolute inset-0 px-3 pt-1.5 pb-2 rounded border border-border/50 overflow-hidden cursor-pointer group hover:bg-sidebar-border/50"
          >
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-normal">
              {signal.prompt || "No prompt defined"}
            </p>
            {/* Bottom gradient */}
            <div className="absolute bottom-[-1px] left-[-1px] right-[-1px] h-[58px] bg-gradient-to-b from-transparent to-secondary pointer-events-none" />
            {/* Edit pencil */}
            <div className="absolute bottom-2 right-2 size-[30px] flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
              <Pencil className="size-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center pt-6">
        <ArrowRight className="size-4 text-muted-foreground" />
      </div>

      {/* Output column */}
      <div className="flex-1 flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Output</span>
        <div className="flex flex-col gap-1">
          <TabButton
            tab="events"
            activeTab={activeTab}
            onClick={() => onTabChange("events")}
            title="Events"
            description="Traces that match your definition"
          />
          <TabButton
            tab="runs"
            activeTab={activeTab}
            onClick={() => onTabChange("runs")}
            title="Runs"
            description="All signal runs"
          />
        </div>
      </div>
    </div>
  );
}
