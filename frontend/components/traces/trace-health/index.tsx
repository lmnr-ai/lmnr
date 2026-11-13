"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { isBlockingFailure, TRACE_HEALTH_RANGES } from "@/lib/trace-health/checks";

import TraceHealthDialog from "./trace-health-dialog";
import { useTraceHealth } from "./use-trace-health";

interface TraceHealthButtonProps {
  onOpenTrace: (traceId: string) => void;
}

/** Shown next to the traces tabs only when the past day of traces has tracing setup issues. */
export default function TraceHealthButton({ onOpenTrace }: TraceHealthButtonProps) {
  const [open, setOpen] = useState(false);
  const { data } = useTraceHealth(TRACE_HEALTH_RANGES[0].pastHours);

  const hasIssues = data?.results.some(isBlockingFailure) ?? false;
  if (!hasIssues && !open) return null;

  return (
    <>
      <Button variant="outline" className="h-8 text-xs" onClick={() => setOpen(true)}>
        <TriangleAlert className="mr-1.5 size-3.5 text-amber-500" />
        Tracing issues detected
      </Button>
      <TraceHealthDialog open={open} onOpenChange={setOpen} onOpenTrace={onOpenTrace} />
    </>
  );
}
