import { cn } from "@/lib/utils";

import { type Step, STEP_TITLES } from "./types";

interface StepNavProps {
  steps: readonly Step[];
  current: Step;
  onSelect: (step: Step) => void;
}

export default function StepNav({ steps, current, onSelect }: StepNavProps) {
  return (
    <ol className="flex items-center gap-1 border-b px-4 py-2 text-xs">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-1">
          {index > 0 && <span className="text-muted-foreground/50">/</span>}
          <button
            type="button"
            onClick={() => onSelect(step)}
            aria-current={step === current ? "step" : undefined}
            className={cn(
              "rounded px-1.5 py-1 transition-colors hover:text-foreground",
              step === current ? "bg-secondary font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {index + 1}. {STEP_TITLES[step]}
          </button>
        </li>
      ))}
    </ol>
  );
}
