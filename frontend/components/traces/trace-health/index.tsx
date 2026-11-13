"use client";

import { HeartPulse, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isBlockingFailure } from "@/lib/trace-health/checks";

import TraceHealthDialog from "./trace-health-dialog";
import { useHiddenChecks } from "./use-hidden-checks";
import { useTraceHealth } from "./use-trace-health";

/** Next to the traces tabs: a warning button when recent traces have unhidden setup issues, else a quiet icon. */
export default function TraceHealthButton() {
  const [open, setOpen] = useState(false);
  const { data } = useTraceHealth();
  const { hidden } = useHiddenChecks();

  if (!data || data.traceCount === 0) return null;
  const hasIssues = data.results.some((r) => isBlockingFailure(r) && !hidden.has(r.id));

  return (
    <>
      {hasIssues ? (
        <Button
          variant="outline"
          className="h-8 border-amber-500/10 bg-yellow-500/5 text-xs hover:bg-yellow-500/10"
          onClick={() => setOpen(true)}
        >
          <TriangleAlert className="mr-1.5 size-3.5 text-amber-500" />
          Tracing issues detected
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Trace health" onClick={() => setOpen(true)}>
              <HeartPulse className="size-4 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Recent traces are all healthy</TooltipContent>
        </Tooltip>
      )}
      <TraceHealthDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
