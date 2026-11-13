"use client";

import { Info } from "lucide-react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { LAMINAR_AGENT_AVAILABLE } from "@/components/agent";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AUTO_RESOLVE_DAYS } from "@/lib/signals/settings";

import { type ManageSignalForm } from "./types";

const REPORTS = {
  name: "reportsEnabled",
  label: "Cluster reports",
  description: "Laminar agent writes a report on each new cluster.",
  info: undefined,
} as const;

// Reports need the Laminar agent, so they're offered only where it runs.
const SETTINGS = [
  ...(LAMINAR_AGENT_AVAILABLE ? [REPORTS] : []),
  {
    name: "autoResolveEnabled",
    label: "Automatically resolve clusters",
    description: `Resolve a cluster once it has had no new events for ${AUTO_RESOLVE_DAYS} days.`,
    info: "Resolved clusters are hidden from the active tab, but will come back if new events arrive in the cluster.",
  },
] as const;

/** Per-signal switches for what clusters of this signal can do. */
export default function ReportsSection() {
  const { control } = useFormContext<ManageSignalForm>();
  const isExisting = Boolean(useWatch({ control, name: "id" }));
  // Auto-resolve is an advanced setting, offered only once the signal exists.
  const settings = isExisting ? SETTINGS : SETTINGS.filter((s) => s.name !== "autoResolveEnabled");
  return settings.map((s) => (
    <Controller
      key={s.name}
      name={s.name}
      control={control}
      render={({ field }) => (
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={`signal-${s.name}`} className="cursor-pointer text-sm font-medium">
                {s.label}
              </Label>
              {s.info && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 cursor-help text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-60">
                      {s.info}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{s.description}</p>
          </div>
          <Switch id={`signal-${s.name}`} checked={field.value ?? false} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  ));
}
