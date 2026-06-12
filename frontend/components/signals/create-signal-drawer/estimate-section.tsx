"use client";

import { Info } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SignalEstimateWindow, SignalRunEstimate } from "@/lib/actions/signals/estimate";

import { type ManageSignalForm } from "./types";

type EstimateState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: SignalRunEstimate }
  | { kind: "error"; message: string; notEnoughData: boolean };

const WINDOW_LABEL: Record<SignalEstimateWindow, string> = {
  day: "1 day",
  month: "1 month",
};

export default function EstimateSection() {
  const { projectId } = useParams();
  const [window, setWindow] = useState<SignalEstimateWindow>("month");
  const [state, setState] = useState<EstimateState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const { control } = useFormContext<ManageSignalForm>();
  const triggers = useWatch({ control, name: "triggers" }) ?? [];

  const runnableTriggers = useMemo(
    () => triggers.filter((t) => t.filters.length > 0).map((t) => ({ filters: t.filters, mode: t.mode ?? 0 })),
    [triggers]
  );
  const runnableTriggerCount = runnableTriggers.length;

  const fetchEstimate = useCallback(
    async (nextWindow: SignalEstimateWindow) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ kind: "loading" });

      try {
        const res = await fetch(`/api/projects/${projectId}/signals/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            window: nextWindow,
            triggers: runnableTriggers,
          }),
        });

        if (!res.ok) {
          let message = "Failed to estimate signal runs.";
          let notEnoughData = false;
          try {
            const body = (await res.json()) as { error?: string; code?: string };
            if (body?.error) message = body.error;
            if (body?.code === "NOT_ENOUGH_DATA") notEnoughData = true;
          } catch {
            // response was not JSON
          }
          if (controller.signal.aborted) return;
          setState({ kind: "error", message, notEnoughData });
          return;
        }

        const data = (await res.json()) as SignalRunEstimate;
        if (controller.signal.aborted) return;
        setState({ kind: "success", data });
      } catch (e) {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Failed to estimate signal runs.",
          notEnoughData: false,
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [projectId, runnableTriggers]
  );

  useEffect(() => {
    if (runnableTriggerCount === 0) {
      setState({ kind: "idle" });
      abortRef.current?.abort();
      return;
    }
    const handle = setTimeout(() => {
      void fetchEstimate(window);
    }, 400);
    return () => {
      clearTimeout(handle);
      abortRef.current?.abort();
    };
  }, [window, fetchEstimate, runnableTriggerCount]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium">Estimated runs</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-60">
              <p>
                How often this signal would fire on historical traces in the last {WINDOW_LABEL[window]}. Realtime
                triggers count as 2 runs per match.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <EstimateInline state={state} window={window} runnableTriggerCount={runnableTriggerCount} />
          <Tabs value={window} onValueChange={(v) => setWindow(v as SignalEstimateWindow)}>
            <TabsList className="h-7">
              <TabsTrigger className="text-xs px-2 py-0.5" value="day">
                Day
              </TabsTrigger>
              <TabsTrigger className="text-xs px-2 py-0.5" value="month">
                Month
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}

function EstimateInline({
  state,
  window,
  runnableTriggerCount,
}: {
  state: EstimateState;
  window: SignalEstimateWindow;
  runnableTriggerCount: number;
}) {
  if (runnableTriggerCount === 0) {
    return <span className="text-sm text-muted-foreground">Add a trigger condition</span>;
  }

  if (state.kind === "loading" || state.kind === "idle") {
    return <span className="text-sm text-muted-foreground">Estimating…</span>;
  }

  if (state.kind === "error") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={
              state.notEnoughData
                ? "text-sm text-amber-500 cursor-help underline decoration-dotted underline-offset-4"
                : "text-sm text-destructive cursor-help underline decoration-dotted underline-offset-4"
            }
          >
            {state.notEnoughData ? "Not enough data" : "Couldn’t estimate"}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-60">
          <p>
            {state.notEnoughData
              ? `No traces older than ${WINDOW_LABEL[window]} in this project. Try a shorter window or wait for more data.`
              : state.message}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const { data } = state;
  return (
    <span className="text-sm">
      <span className="font-semibold tabular-nums">~{data.estimatedRuns.toLocaleString()}</span>
      <span className="text-muted-foreground"> of {data.tracesChecked.toLocaleString()} traces</span>
    </span>
  );
}
