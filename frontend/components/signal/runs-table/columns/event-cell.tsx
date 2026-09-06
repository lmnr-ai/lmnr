"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { signalTraceHref, useSignalTraceParams } from "@/components/signal/hooks/use-signal-trace-params";
import { NIL_EVENT_ID } from "@/components/signal/runs-table/constants";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { type SignalRunRow } from "@/lib/actions/signal-runs/types";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";

export const hasRunEvent = (row: Pick<SignalRunRow, "eventId">): boolean =>
  !!row.eventId && row.eventId !== NIL_EVENT_ID;

export function runTraceParams(row: Pick<SignalRunRow, "traceId" | "eventId">) {
  return {
    traceId: row.traceId,
    eventId: hasRunEvent(row) ? row.eventId : null,
    spanId: null,
  };
}

export const EventCell = ({ row }: { row: SignalRunRow }) => {
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const [, setTraceParams] = useSignalTraceParams();

  const fired = hasRunEvent(row);
  const values = runTraceParams(row);
  const href = signalTraceHref(pathName, searchParams.toString(), values);

  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className={cn(
            "inline-flex items-center gap-1 text-xs min-w-0 hover:underline",
            fired ? "text-primary" : "text-muted-foreground"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            track("signals", "run_to_trace");
            void setTraceParams(values);
          }}
        >
          {fired ? "Event" : "No event"}
          <ArrowUpRight className="size-3.5 shrink-0" />
        </Link>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>Open trace</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};
