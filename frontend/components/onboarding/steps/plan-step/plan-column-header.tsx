import { type PlanColumn } from "@/components/onboarding/steps/plan-step/plans";
import { cn } from "@/lib/utils";

interface PlanColumnHeaderProps {
  column: PlanColumn;
  onSelect: () => void;
}

export default function PlanColumnHeader({ column, onSelect }: PlanColumnHeaderProps) {
  const { plan, selected, disabled, isCurrent, trialDays } = column;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className="flex w-full flex-col gap-1 text-left disabled:cursor-not-allowed"
    >
      <span className="flex items-center gap-2 text-sm xl:text-base text-white">
        <span
          className={cn(
            "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-primary" : "border-foreground-500"
          )}
        >
          {selected && <span className="size-1.5 rounded-full bg-primary" />}
        </span>
        {plan.name}
        {isCurrent && (
          <span className="ml-auto text-[10px] 2xl:text-xs px-1.5 py-0.5 rounded-full bg-surface-400 text-white font-medium">
            Current
          </span>
        )}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="font-sans-landing font-medium text-xl xl:text-2xl leading-none text-white tracking-[-0.02em]">
          {trialDays ? "$0" : plan.price}
        </span>
        <span className="text-xs text-foreground-400">
          {trialDays ? `for ${trialDays} days, then ${plan.price} / mo` : "/ month"}
        </span>
      </span>
      {/* Non-breaking space keeps every header the same height. */}
      <span className="text-[11px] xl:text-xs font-medium text-primary">
        {trialDays ? "No credit card needed" : " "}
      </span>
    </button>
  );
}
