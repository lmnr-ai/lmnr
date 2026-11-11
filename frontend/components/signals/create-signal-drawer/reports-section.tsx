"use client";

import { Controller, useFormContext } from "react-hook-form";

import { LAMINAR_AGENT_AVAILABLE } from "@/components/agent";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
] as const;

/** Per-signal switches for what clusters of this signal can do. */
export default function ReportsSection() {
  const { control } = useFormContext<ManageSignalForm>();
  return SETTINGS.map((s) => (
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
          <Switch id={`signal-${s.name}`} checked={field.value ?? false} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  ));
}
