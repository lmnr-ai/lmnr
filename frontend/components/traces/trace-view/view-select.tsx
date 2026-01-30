import { TooltipPortal } from "@radix-ui/react-tooltip";
import { CirclePlay, Eye, EyeOff, GanttChart, List, ListTree, SlidersHorizontal } from "lucide-react";

import LangGraphViewTrigger from "@/components/traces/trace-view/lang-graph-view-trigger";
import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils.ts";

export default function ViewSelect() {
  const {
    tab,
    setTab,
    showTreeContent,
    setShowTreeContent,
    condensedTimelineEnabled,
    setCondensedTimelineEnabled,
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
    condensedTimelineEnabled: state.condensedTimelineEnabled,
    setCondensedTimelineEnabled: state.setCondensedTimelineEnabled,
    browserSession: state.browserSession,
    setBrowserSession: state.setBrowserSession,
    langGraph: state.langGraph,
    setLangGraph: state.setLangGraph,
    getHasLangGraph: state.getHasLangGraph,
    trace: state.trace,
  }));

  const isTreeView = tab === "tree";
  const isReaderView = tab === "reader";
  const hasLangGraph = getHasLangGraph();

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-1">
        {/* Tree button */}
        <button
          onClick={() => setTab("tree")}
          className={cn(
            "flex items-center h-6 px-1.5 text-xs border rounded-md",
            isTreeView
              ? "border-primary text-primary bg-primary/10 hover:bg-primary/20"
              : "border-input bg-background hover:bg-secondary/50"
          )}
        >
          <ListTree size={14} className="mr-1" />
          Tree
        </button>

        {/* Reader button */}
        <button
          onClick={() => setTab("reader")}
          className={cn(
            "flex items-center h-6 px-1.5 text-xs border rounded-md",
            isReaderView
              ? "border-primary text-primary bg-primary/10 hover:bg-primary/20"
              : "border-input bg-background hover:bg-secondary/50"
          )}
        >
          <List size={14} className="mr-1" />
          Reader
        </button>

        {/* Config dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isReaderView}>
            <button
              className={cn(
                "flex items-center h-6 px-1.5 rounded-md",
                isReaderView ? "text-muted-foreground cursor-not-allowed" : "hover:bg-secondary/50"
              )}
            >
              <SlidersHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setShowTreeContent(!showTreeContent)}>
              {showTreeContent ? <EyeOff size={14} /> : <Eye size={14} />}
              {showTreeContent ? "Hide content" : "Show content"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-x-0.5">
        {/* Timeline toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setCondensedTimelineEnabled(!condensedTimelineEnabled)}
              variant="ghost"
              className={cn("h-6 px-1.5", {
                "text-primary": condensedTimelineEnabled,
              })}
            >
              <GanttChart size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>{condensedTimelineEnabled ? "Hide Timeline" : "Show Timeline"}</TooltipContent>
          </TooltipPortal>
        </Tooltip>
        {/* Session toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              disabled={!trace}
              className={cn("h-6 px-1.5", {
                "text-primary": browserSession,
              })}
              variant="ghost"
              onClick={() => setBrowserSession(!browserSession)}
            >
              <CirclePlay size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>{browserSession ? "Hide Media Viewer" : "Show Media Viewer"}</TooltipContent>
          </TooltipPortal>
        </Tooltip>
        {/* LangGraph toggle */}
        {hasLangGraph && <LangGraphViewTrigger setOpen={setLangGraph} open={langGraph} />}
      </div>
    </div>
  );
}
