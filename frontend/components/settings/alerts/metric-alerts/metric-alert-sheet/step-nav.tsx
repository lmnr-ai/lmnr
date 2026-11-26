import { cn } from "@/lib/utils";

import { type Step, STEP_TITLES } from "./types";

interface StepNavProps {
  steps: readonly Step[];
  current: Step;
  onSelect: (step: Step) => void;
}

export default function StepNav({ steps, current, onSelect }: StepNavProps) {
  const currentIndex = steps.indexOf(current);
  return (
    <ol className="flex items-center gap-2 overflow-x-auto border-b px-4 py-2.5 text-xs">
      {steps.map((step, index) => (
        <li key={step} className="flex shrink-0 items-center gap-2">
          {index > 0 && <span className="h-px w-3 bg-border" />}
          <button
            type="button"
            onClick={() => onSelect(step)}
            aria-current={step === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded transition-colors hover:text-foreground",
              step === current ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-[11px] tabular-nums",
                step === current && "border-primary bg-primary text-primary-foreground",
                index < currentIndex && "border-primary/40 bg-primary/10 text-foreground"
              )}
            >
              {index + 1}
            </span>
            {STEP_TITLES[step]}
          </button>
        </li>
      ))}
    </ol>
  );
}
