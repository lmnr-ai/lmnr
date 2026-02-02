import { ChevronDown, CirclePlay, Eye, EyeOff, List, ListTree, type LucideIcon } from "lucide-react";

import LangGraphViewTrigger from "@/components/traces/trace-view/lang-graph-view-trigger";
import { TraceStatsShields } from "@/components/traces/stats-shields";
import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils.ts";

type ViewTab = "tree" | "reader";

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
  reader: {
    icon: List,
    label: "Reader",
  },
};

const viewTabs: ViewTab[] = ["tree", "reader"];

export default function ViewSelect() {
  const {
    tab,
    setTab,
    showTreeContent,
    setShowTreeContent,
    browserSession,
    setBrowserSession,
    langGraph,
    setLangGraph,
    getHasLangGraph,
    trace,
  } = useTraceViewStoreContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    showTreeContent: state.showTreeContent,
    setShowTreeContent: state.setShowTreeContent,
    browserSession: state.browserSession,
    setBrowserSession: state.setBrowserSession,
    langGraph: state.langGraph,
    setLangGraph: state.setLangGraph,
    getHasLangGraph: state.getHasLangGraph,
    trace: state.trace,
  }));

  const isValidTab = viewTabs.includes(tab as ViewTab);
  const displayTab: ViewTab = isValidTab ? (tab as ViewTab) : "tree";
  const currentView = viewOptions[displayTab];
  const CurrentIcon = currentView.icon;

  const isTreeView = tab === "tree";
  const contentVisible = showTreeContent ?? true;
  const hasLangGraph = getHasLangGraph();

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        {/* View dropdown */}
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
        {/* Content toggle (only visible in tree view) */}
        {isTreeView && (
          <button
            onClick={() => setShowTreeContent(!contentVisible)}
            className={cn(
              "flex items-center h-6 px-1.5 text-xs border border-l-0 rounded-md rounded-l-none bg-background -ml-2",
              contentVisible ? "border-primary text-primary hover:bg-primary/10" : "border-input hover:bg-secondary/50"
            )}
          >
            {contentVisible ? <Eye size={14} className="mr-1" /> : <EyeOff size={14} className="mr-1" />}
            <span>Content</span>
          </button>
        )}
        {/* Stats Shield */}
        {trace && <TraceStatsShields className="min-w-0 overflow-hidden" trace={trace} singlePill />}
      </div>

      <div className="flex items-center gap-1">
        {/* Session toggle */}
        <Button
          disabled={!trace}
          className={cn("h-6 px-1.5 text-xs", {
            "border-primary text-primary": browserSession,
          })}
          variant="outline"
          onClick={() => setBrowserSession(!browserSession)}
        >
          <CirclePlay size={14} className="mr-1" />
          Media
        </Button>
        {/* LangGraph toggle */}
        {hasLangGraph && <LangGraphViewTrigger setOpen={setLangGraph} open={langGraph} />}
      </div>
    </div>
  );
}
