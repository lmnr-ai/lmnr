import { AlignLeft, ChartNoAxesGantt, ChevronDown, GanttChart, List, ListTree, type LucideIcon } from "lucide-react";

import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
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
  const { tab, setTab, showTreeContent, setShowTreeContent, condensedTimelineEnabled, setCondensedTimelineEnabled } = useTraceViewStoreContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    showTreeContent: state.showTreeContent,
    setShowTreeContent: state.setShowTreeContent,
    condensedTimelineEnabled: state.condensedTimelineEnabled,
    setCondensedTimelineEnabled: state.setCondensedTimelineEnabled,
  }));

  const isValidTab = viewTabs.includes(tab as ViewTab);
  const displayTab: ViewTab = isValidTab ? (tab as ViewTab) : "tree";
  const currentView = viewOptions[displayTab];
  const CurrentIcon = currentView.icon;

  const isTreeView = tab === "tree";
  const isReaderView = tab === "reader";
  const showTimelineToggle = isTreeView || isReaderView;
  const contentVisible = showTreeContent ?? true;

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center h-6 px-1.5 text-xs border bg-background focus-visible:outline-0",
              isValidTab ? "border-primary text-primary hover:bg-primary/10" : "hover:bg-secondary/50",
              showTimelineToggle ? "rounded-l-md rounded-r-none border-r-primary" : "rounded-md"
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
      {showTimelineToggle && (
        <button
          onClick={() => setCondensedTimelineEnabled(!condensedTimelineEnabled)}
          className={cn(
            "flex items-center h-6 px-1.5 text-xs border border-l-0 bg-background",
            isTreeView ? "rounded-none" : "rounded-r-md",
            condensedTimelineEnabled ? "border-primary text-primary hover:bg-primary/10" : "border-input hover:bg-secondary/50"
          )}
        >
          <GanttChart size={14} />
          <span className="ml-1">Timeline</span>
        </button>
      )}
      {isTreeView && (
        <button
          onClick={() => setShowTreeContent(!contentVisible)}
          className={cn(
            "flex items-center h-6 px-1.5 text-xs border border-l-0 rounded-r-md bg-background",
            contentVisible ? "border-primary text-primary hover:bg-primary/10" : "border-input hover:bg-secondary/50"
          )}
        >
          <AlignLeft size={14} />
          <span className="ml-1">Content</span>
        </button>
      )}
    </div>
  );
}
