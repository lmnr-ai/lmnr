"use client";

import { Check } from "lucide-react";

import { type PlanOption } from "@/components/onboarding/steps/plan-step/plans";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  plan: PlanOption;
  selected: boolean;
  onSelect: () => void;
}

export default function PlanCard({ plan, selected, onSelect }: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-left rounded-lg border p-4 flex flex-col gap-3 transition-colors",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background",
        plan.highlight && !selected && "border-primary/40"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{plan.name}</span>
        {selected && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
            Selected
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold">{plan.price}</span>
        <span className="text-xs text-muted-foreground">{plan.priceSubtext}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {plan.features.map((f) => (
          <li key={f} className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}
