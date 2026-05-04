"use client";

import { AlertTriangle, Info, Loader2, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
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
  // Stable signature of the trigger set — so the refetch effect doesn't depend on
  // JSON.stringify inside its deps array (anti-pattern: recomputed every render).
  const triggersSignature = useMemo(() => JSON.stringify(runnableTriggers), [runnableTriggers]);

  const fetchEstimate = useCallback(
    async (nextWindow: SignalEstimateWindow) => {
      // Abort any prior in-flight request — only the latest estimate is relevant.
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

  // Refetch whenever the user flips the window or changes the trigger set. Debounced so
  // typing in a filter value doesn't hammer the API on every keystroke. Cleanup also
  // aborts any in-flight fetch so it doesn't dangle after unmount or a deps change.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window, triggersSignature, runnableTriggerCount]);

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">Estimated signal runs</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-60">
                <p>
                  Runs the configured triggers over historical traces so you can preview how often the signal would
                  fire. Realtime triggers are billed as 2 runs per match.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <div className="flex items-center gap-2">
          <Tabs value={window} onValueChange={(v) => setWindow(v as SignalEstimateWindow)}>
            <TabsList className="h-7">
              <TabsTrigger className="text-xs px-2 py-0.5" value="day">
                1 Day
              </TabsTrigger>
              <TabsTrigger className="text-xs px-2 py-0.5" value="month">
                1 Month
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => fetchEstimate(window)}
            disabled={runnableTriggerCount === 0 || state.kind === "loading"}
            aria-label="Refresh estimate"
          >
            <RefreshCw className={state.kind === "loading" ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
          </Button>
        </div>
      </div>

      <EstimateBody state={state} window={window} runnableTriggerCount={runnableTriggerCount} />
    </div>
  );
}

function EstimateBody({
  state,
  window,
  runnableTriggerCount,
}: {
  state: EstimateState;
  window: SignalEstimateWindow;
  runnableTriggerCount: number;
}) {
  if (runnableTriggerCount === 0) {
    return (
      <div className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
        Add a trigger with at least one condition to estimate how many signal runs it would produce.
      </div>
    );
  }

  if (state.kind === "loading" || state.kind === "idle") {
    return (
      <div className="rounded-md border p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Estimating over the last {WINDOW_LABEL[window]}...
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className={
          state.notEnoughData
            ? "rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex items-start gap-2"
            : "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2"
        }
      >
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          {state.notEnoughData ? (
            <>
              <div className="font-medium">Not enough historical data</div>
              <div className="text-muted-foreground">
                There aren&apos;t enough traces older than {WINDOW_LABEL[window]} in this project to produce an
                estimate. Switch to a shorter window or wait for more data to accumulate.
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">Couldn&apos;t estimate runs</div>
              <div className="text-muted-foreground">{state.message}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  const { data } = state;
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{data.estimatedRuns.toLocaleString()}</span>
        <span className="text-xs text-muted-foreground">
          signal run{data.estimatedRuns === 1 ? "" : "s"} in the last {WINDOW_LABEL[window]}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        Based on {data.tracesChecked.toLocaleString()} trace{data.tracesChecked === 1 ? "" : "s"} in the last{" "}
        {WINDOW_LABEL[window]}.
      </div>
      {data.perTrigger.length > 1 && (
        <ul className="text-xs text-muted-foreground grid gap-0.5">
          {data.perTrigger.map((t, i) => (
            <li key={i} className="flex items-center justify-between">
              <span>
                Trigger {i + 1}
                {t.mode === 1 ? " (realtime)" : ""}:
              </span>
              <span className="tabular-nums">
                {t.estimatedMatches.toLocaleString()} match{t.estimatedMatches === 1 ? "" : "es"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
