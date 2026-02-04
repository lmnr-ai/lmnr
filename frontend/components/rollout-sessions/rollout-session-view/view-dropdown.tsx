import { ChartNoAxesGantt, ChevronDown, Eye, EyeOff, List, ListTree, type LucideIcon } from "lucide-react";

import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
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
  const { tab, setTab, showTreeContent, setShowTreeContent } = useRolloutSessionStoreContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    showTreeContent: state.showTreeContent,
    setShowTreeContent: state.setShowTreeContent,
  }));

  const isValidTab = viewTabs.includes(tab as ViewTab);
  const displayTab: ViewTab = isValidTab ? (tab as ViewTab) : "tree";
  const currentView = viewOptions[displayTab];
  const CurrentIcon = currentView.icon;

  const isTreeView = tab === "tree";
  const contentVisible = showTreeContent ?? true;

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center h-6 px-1.5 text-xs border rounded-md bg-background focus-visible:outline-0",
              isValidTab ? "border-primary text-primary hover:bg-primary/10" : "hover:bg-secondary/50",
              isTreeView && "rounded-r-none border-r-0 outline-1 outline-inset outline-primary -outline-offset-1"
            )}
          >
            <CurrentIcon size={14} className="mr-1" />
            <span className="capitalize">{currentView.label}</span>
            <ChevronDown size={14} className="ml-1" />
          </button>
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
      {isTreeView && (
        <button
          onClick={() => setShowTreeContent(!contentVisible)}
          className={cn(
            "flex items-center h-6 px-1.5 text-xs border border-l-0 rounded-md rounded-l-none bg-background",
            contentVisible ? "border-primary text-primary hover:bg-primary/10" : "border-input hover:bg-secondary/50"
          )}
        >
          {contentVisible ? <Eye size={14} className="mr-1" /> : <EyeOff size={14} className="mr-1" />}
          <span>Content</span>
        </button>
      )}
    </div>
  );
}
