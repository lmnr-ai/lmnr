"use client";

import { Check } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import SetupStep from "./setup-step";
import { type SetupSteps } from "./use-setup-steps";

export { useSetupSteps } from "./use-setup-steps";

/** The setup progress in the agent's header, a dot per step; the steps open in a popover. */
export default function SetupPill({ setup }: { setup: SetupSteps }) {
  const { steps, done, complete } = setup;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Setup, ${done} of ${steps.length} steps done`}
          className="flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs text-muted-foreground transition-colors hover:bg-emphasis-1"
        >
          Setup
          {complete ? (
            <Check className="size-3 text-success" />
          ) : (
            <span className="flex items-center gap-1">
              {steps.map((step) => (
                <span
                  key={step.title}
                  className={cn(
                    "size-1.5 rounded-full",
                    step.done ? "bg-success" : "border border-muted-foreground/60"
                  )}
                />
              ))}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-96 flex-col gap-3 p-3">
        {steps.map((step) => (
          <SetupStep key={step.title} done={step.done} title={step.title} description={step.description} />
        ))}
      </PopoverContent>
    </Popover>
  );
}
