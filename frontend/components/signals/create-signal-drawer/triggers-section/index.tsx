"use client";

import { Info } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";

import FiltersField from "./filters-field";
import ProcessingModeSelect from "./processing-mode-select";
import TriggerPicker from "./trigger-picker";

export default function TriggersSection() {
  const featureFlags = useFeatureFlags();
  const batchEnabled = featureFlags[Feature.BATCH_SIGNALS];

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">Trigger</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-60">
                <p>When should this Signal run?</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <TriggerPicker />
      </div>

      <div className="grid gap-2">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">Filters</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-40">
                <p>Which traces should this Signal run on?</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <FiltersField />
      </div>

      {batchEnabled && <ProcessingModeSelect />}
    </div>
  );
}
