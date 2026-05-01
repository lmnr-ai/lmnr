"use client";

import { Info } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { type ManageSignalForm } from "./types";

export default function SamplingSection() {
  const { control, watch, setValue } = useFormContext<ManageSignalForm>();
  const sampleRate = watch("sampleRate");
  const isEnabled = sampleRate !== null && sampleRate !== undefined;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">Sampling</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-60">
                <p>
                  When enabled, only a percentage of traces will be analyzed. Traces are sampled per user to ensure
                  diverse coverage across different users.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <Switch
          checked={isEnabled}
          onCheckedChange={(checked) => {
            setValue("sampleRate", checked ? 25 : null, { shouldDirty: true });
          }}
        />
      </div>
      {isEnabled && (
        <div className="rounded-md border p-3 space-y-3">
          <Controller
            name="sampleRate"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Slider
                  className="w-1/2"
                  min={5}
                  max={95}
                  step={5}
                  value={[field.value ?? 25]}
                  onValueChange={([v]) => field.onChange(v)}
                />
                <span className="text-sm font-medium w-10">{field.value ?? 25}%</span>
              </div>
            )}
          />
          <p className="text-xs text-muted-foreground w-1/2">
            {sampleRate}% of all traces will be processed. When user_id is set, traces are sampled evenly across users
            so each gets equal coverage.{" "}
            <a
              href="https://laminar.sh/docs/tracing/structure/user-id"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Learn more how to set user id per trace
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
