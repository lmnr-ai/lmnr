"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SignalTab {
  id: string;
  name: string;
}

interface SignalTabBarProps {
  tabs: SignalTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
}

function TabButton({ tab, isActive, onClick }: { tab: SignalTab; isActive: boolean; onClick: () => void }) {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "block border-b-2 py-1 transition-all text-sm font-medium min-w-[120px] max-w-[120px] truncate text-left",
              isActive
                ? "border-b-secondary-foreground text-foreground"
                : "border-b-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.name}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{tab.name}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function SignalTabBar({ tabs, activeTabId, onTabSelect }: SignalTabBarProps) {
  return (
    <div className="flex items-center gap-3 px-3 border-b overflow-x-auto no-scrollbar">
      {tabs.map((tab) => (
        <TabButton key={tab.id} tab={tab} isActive={activeTabId === tab.id} onClick={() => onTabSelect(tab.id)} />
      ))}
    </div>
  );
}
