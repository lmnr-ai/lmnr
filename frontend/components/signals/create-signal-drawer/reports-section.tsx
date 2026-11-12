"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";

import { LAMINAR_AGENT_AVAILABLE } from "@/components/agent";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AUTO_RESOLVE_DAYS } from "@/lib/signals/settings";

import { type ManageSignalForm } from "./types";

const REPORTS = {
  name: "reportsEnabled",
  label: "Cluster reports",
  description: "Laminar agent writes a report on each new cluster.",
} as const;

// Reports need the Laminar agent, so they're offered only where it runs.
const SETTINGS = [
  ...(LAMINAR_AGENT_AVAILABLE ? [REPORTS] : []),
  {
    name: "resolvingEnabled",
    label: "Allow clusters to be resolved",
    description: "Mark clusters resolved once they're fixed, and reopen them.",
  },
  {
    name: "autoResolveEnabled",
    label: "Automatically resolve clusters",
    description: `Resolve a cluster once it has had no new events for ${AUTO_RESOLVE_DAYS} days.`,
  },
] as const;

/** Per-signal switches for what clusters of this signal can do. */
export default function ReportsSection() {
  const { control } = useFormContext<ManageSignalForm>();
  const resolving = useWatch({ control, name: "resolvingEnabled" });
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
            <Label htmlFor={`signal-${s.name}`} className="cursor-pointer text-sm font-medium">
              {s.label}
            </Label>
            <p className="text-xs text-muted-foreground">{s.description}</p>
          </div>
          <Switch
            id={`signal-${s.name}`}
            checked={field.value ?? false}
            onCheckedChange={field.onChange}
            // Auto-resolving needs resolving; the stored value is kept so turning resolving back on restores it.
            disabled={s.name === "autoResolveEnabled" && !resolving}
          />
        </div>
      )}
    />
  ));
}
