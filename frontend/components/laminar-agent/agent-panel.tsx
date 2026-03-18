"use client";

import { Columns2, MessageCircleQuestion, PanelRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { type AgentViewMode, useLaminarAgentStore } from "./store";

interface AgentPanelProps {
  currentMode: "floating" | "side-by-side";
}

export default function AgentPanel({ currentMode }: AgentPanelProps) {
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);
  const collapse = useLaminarAgentStore((s) => s.collapse);

  const alternateMode: AgentViewMode = currentMode === "floating" ? "side-by-side" : "floating";
  const alternateModeLabel = currentMode === "floating" ? "Switch to side-by-side" : "Switch to floating";
  const AlternateModeIcon = currentMode === "floating" ? PanelRight : Columns2;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 h-10 border-b shrink-0">
        <span className="text-sm font-medium">Laminar Agent</span>
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode(alternateMode)}>
                  <AlternateModeIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{alternateModeLabel}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={collapse}>
                  <X className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Chat area placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-auto">
        <div className="flex flex-col items-center gap-3 text-center">
          <MessageCircleQuestion className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-xs">
            Ask questions about your traces, signals, or anything on the platform.
          </p>
        </div>
      </div>

      {/* Input area placeholder */}
      <div className="shrink-0 border-t px-3 py-2">
        <div className="rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">Ask Laminar Agent...</span>
        </div>
      </div>
    </div>
  );
}
