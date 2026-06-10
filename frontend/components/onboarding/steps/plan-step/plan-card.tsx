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

// Styled to match the regular (non-accent) pricing-page tier columns: a flat
// surface-550 panel, no border, no divider under the price, landing fonts.
// Selection uses an INSET ring (drawn inside the box) so the ScrollArea's overflow
// can't clip it the way an outset ring/border at the grid edge would be.
export default function PlanCard({ plan, selected, onSelect, disabled = false, isCurrent = false }: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-disabled={disabled}
      className={cn(
        "relative flex flex-col gap-3 2xl:gap-4 rounded-md p-4 xl:p-5 2xl:p-6 text-left transition-all bg-landing-surface-550",
        !disabled && "hover:bg-landing-surface-500",
        selected && "ring-1 ring-inset ring-primary",
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
        <span className="text-sm xl:text-base 2xl:text-lg text-white">{plan.name}</span>
        {isCurrent ? (
          <span className="text-[10px] 2xl:text-xs px-1.5 py-0.5 rounded-full bg-landing-surface-400 text-white font-medium">
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

      <p className="flex items-baseline gap-1">
        <span className="font-sans-landing font-medium text-2xl xl:text-3xl 2xl:text-4xl leading-none text-white tracking-[-0.02em]">
          {plan.price}
        </span>
        <span className="text-xs 2xl:text-sm text-landing-text-400">{plan.priceSubtext}</span>
      </p>

      <ul className="flex flex-col gap-1.5 2xl:gap-2 flex-1">
        {plan.features.map((f) => (
          <li key={f.label} className="flex flex-col gap-0.5">
            <div className="flex items-start gap-2">
              <Check className="h-3 w-3 2xl:h-4 2xl:w-4 mt-0.5 shrink-0 text-landing-text-300" strokeWidth={2.5} />
              <span className="text-sm text-landing-text-200">{f.label}</span>
            </div>
            {f.sub && <span className="text-xs text-landing-text-400 ml-[22px] 2xl:ml-[24px]">{f.sub}</span>}
          </li>
        ))}
      </ul>
    </button>
  );
}
