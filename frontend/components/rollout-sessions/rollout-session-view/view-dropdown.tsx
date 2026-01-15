import { ChartNoAxesGantt, ChevronDown, List, ListTree, type LucideIcon } from "lucide-react";

import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils.ts";

type ViewTab = "tree" | "timeline" | "reader";

const viewOptions: Record<
  ViewTab,
  {
    icon: LucideIcon;
    label: string;
  }
> = {
  tree: {
    icon: ListTree,
    label: "Tree",
  },
  timeline: {
    icon: ChartNoAxesGantt,
    label: "Timeline",
  },
  reader: {
    icon: List,
    label: "Reader",
  },
};

const viewTabs: ViewTab[] = ["tree", "timeline", "reader"];

export default function ViewDropdown() {
  const { tab, setTab } = useRolloutSessionStoreContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
  }));

  const isValidTab = viewTabs.includes(tab as ViewTab);
  const displayTab: ViewTab = isValidTab ? (tab as ViewTab) : "tree";
  const currentView = viewOptions[displayTab];
  const CurrentIcon = currentView.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-6 text-xs px-1.5 focus-visible:outline-0", {
            "border-primary text-primary": isValidTab,
          })}
        >
          <CurrentIcon size={14} className="mr-1" />
          <span className="capitalize">{currentView.label}</span>
          <ChevronDown size={14} className="ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {viewTabs.map((option) => {
          const view = viewOptions[option];
          const OptionIcon = view.icon;
          return (
            <DropdownMenuItem key={option} onClick={() => setTab(option)} className={cn(tab === option && "bg-accent")}>
              <OptionIcon size={14} />
              {view.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
