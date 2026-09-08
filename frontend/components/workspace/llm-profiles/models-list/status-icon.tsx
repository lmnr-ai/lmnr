"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { type ModelTestStatus, STATUS_ICON_SIZE } from "./types";

export function StatusIcon({ status }: { status: ModelTestStatus }) {
  switch (status.state) {
    case "idle":
      return null;
    case "testing":
      return <Loader2 size={STATUS_ICON_SIZE} className="animate-spin text-muted-foreground" aria-label="Testing" />;
    case "ok":
      return (
        <span className="flex items-center gap-1 text-success">
          <span className="text-[11px] text-muted-foreground tabular-nums">{status.latencyMs} ms</span>
          <Check size={STATUS_ICON_SIZE} aria-label="Connection OK" />
        </span>
      );
    case "error":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center text-destructive" aria-label="Connection failed">
              <TriangleAlert size={STATUS_ICON_SIZE} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs break-words">
            {status.error}
          </TooltipContent>
        </Tooltip>
      );
  }
}
