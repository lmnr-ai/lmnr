"use client";

import { Check, Sparkles } from "lucide-react";

import { type PlanOption } from "@/components/onboarding/steps/plan-step/plans";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  plan: PlanOption;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  isCurrent?: boolean;
}

export default function PlanCard({ plan, selected, onSelect, disabled = false, isCurrent = false }: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-disabled={disabled}
      className={cn(
        "relative text-left rounded-xl border p-4 xl:p-5 2xl:p-6 flex flex-col gap-3 2xl:gap-4 transition-all",
        !disabled && "hover:border-primary/60 hover:shadow-sm",
        selected && "border-primary bg-primary/5 shadow-sm",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {plan.highlight && !selected && !disabled && (
        <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] 2xl:text-xs font-medium text-primary-foreground shadow-sm">
          <Sparkles className="h-2.5 w-2.5 2xl:h-3 2xl:w-3" />
          Most popular
        </span>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm xl:text-base 2xl:text-lg font-semibold tracking-tight text-secondary-foreground">
          {plan.name}
        </span>
        {isCurrent ? (
          <span className="text-[10px] 2xl:text-xs px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium border">
            Current
          </span>
        ) : (
          selected && (
            <span className="text-[10px] 2xl:text-xs px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
              Selected
            </span>
          )
        )}
      </div>

      <div className="flex items-baseline gap-1 border-b pb-3 2xl:pb-4">
        <span className="text-2xl xl:text-3xl 2xl:text-4xl font-bold tracking-tight">{plan.price}</span>
        <span className="text-xs 2xl:text-sm text-muted-foreground">{plan.priceSubtext}</span>
      </div>

      <ul className="flex flex-col gap-1.5 2xl:gap-2">
        {plan.features.map((f) => (
          <li key={f.label} className="text-sm text-muted-foreground flex items-start gap-2">
            <Check className="h-3 w-3 2xl:h-4 2xl:w-4 text-primary shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span>{f.label}</span>
              {f.sub && <span className="text-xs text-muted-foreground/70">{f.sub}</span>}
            </div>
          </li>
        ))}
      </ul>
    </button>
  );
}
