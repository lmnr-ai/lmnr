"use client";

import { Info } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { type ManageSignalForm } from "./types";

const SAMPLING_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];

export default function SamplingSection() {
  const { control, watch, setValue } = useFormContext<ManageSignalForm>();
  const sampleRate = watch("sampleRate");
  const isEnabled = sampleRate !== null && sampleRate !== undefined;

  return (
    <div className="grid gap-1.5">
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
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => {
              setValue("sampleRate", checked ? 50 : null, { shouldDirty: true });
            }}
          />
          <span className="text-sm text-muted-foreground">Enable</span>
        </div>
        {isEnabled && (
          <div className="flex items-center gap-3">
            <Controller
              name="sampleRate"
              control={control}
              render={({ field }) => (
                <Select value={String(field.value ?? 50)} onValueChange={(v) => field.onChange(Number(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SAMPLING_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={String(opt)}>
                        {opt}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <span className="text-xs text-muted-foreground">
              of all traces will be processed with per-user sampling.{" "}
              <a
                href="https://docs.laminar.sh/tracing/structure/user-id"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Learn how to set user id per trace.
              </a>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
