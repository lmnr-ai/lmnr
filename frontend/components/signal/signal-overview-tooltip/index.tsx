"use client";

import { useCallback } from "react";

import SignalOverviewContent from "@/components/signal/signal-overview-tooltip/signal-overview-content";
import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SignalOverviewTooltipProps {
  signal: Omit<ManageSignalForm, "id"> & { id: string };
  activeTab: string;
  onTabChange: (tab: string) => void;
  onEditClick: () => void;
  children: React.ReactNode;
}

export default function SignalOverviewTooltip({
  signal,
  activeTab,
  onTabChange,
  onEditClick,
  children,
}: SignalOverviewTooltipProps) {
  const handleTabChange = useCallback(
    (tab: string) => {
      onTabChange(tab);
    },
    [onTabChange]
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="w-[800px] p-0 bg-secondary outline outline-sidebar-border shadow-xl shadow-background/80 rounded-lg"
        >
          <SignalOverviewContent
            signal={signal}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onEditClick={onEditClick}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
