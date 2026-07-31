"use client";

import { Check, Info } from "lucide-react";
import { useFormContext } from "react-hook-form";

import {
  getRootSpanFinishedCondition,
  getSpanNameCondition,
  getTriggerKind,
  TRIGGER_KIND,
  type TriggerKind,
} from "@/components/signals/trigger-filter-field";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { type ManageSignalForm } from "../types";
import { TRIGGER_INDEX } from "./constants";
import SpanNamesField from "./span-names-field";

const options: { kind: TriggerKind; title: string; description: string }[] = [
  {
    kind: TRIGGER_KIND.ROOT_SPAN_FINISHED,
    title: "When a trace finishes",
    description: "Analysis begins when the trace's root span ends. Right for most agents.",
  },
  {
    kind: TRIGGER_KIND.SPAN_NAME,
    title: "When a specific span finishes",
    description: "Analysis begins when the span you specify by name ends.",
  },
];

export default function TriggerPicker() {
  const { watch, setValue } = useFormContext<ManageSignalForm>();
  const conditions = watch(`triggers.${TRIGGER_INDEX}.conditions`) ?? [];
  const selected = getTriggerKind(conditions);

  const select = (kind: TriggerKind) => {
    if (kind === selected) return;
    setValue(
      `triggers.${TRIGGER_INDEX}.conditions`,
      kind === TRIGGER_KIND.SPAN_NAME ? [getSpanNameCondition([])] : [getRootSpanFinishedCondition()],
      { shouldDirty: true, shouldValidate: true }
    );
  };

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {options.map((option) => {
          const isSelected = option.kind === selected;
          const isSpanName = option.kind === TRIGGER_KIND.SPAN_NAME;
          return (
            <div
              key={option.kind}
              className={cn(
                "relative rounded-lg border transition-colors",
                isSelected ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"
              )}
            >
              <button
                type="button"
                onClick={() => select(option.kind)}
                className={cn("flex w-full items-start gap-3 p-3 text-left", isSpanName && "pr-8")}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{option.title}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </span>
              </button>
              {isSpanName && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute top-3 right-3 text-muted-foreground cursor-help">
                        <Info className="size-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56">
                      <p>
                        Necessary when spans can arrive after the root span finishes <br />
                        e.g. Distributed Tracing
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          );
        })}
      </div>
      {selected === TRIGGER_KIND.SPAN_NAME && <SpanNamesField />}
    </div>
  );
}
