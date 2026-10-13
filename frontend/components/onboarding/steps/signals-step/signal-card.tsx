import { Check } from "lucide-react";

import { type OnboardingSignal } from "@/components/onboarding/steps/signals-step/constants";
import { ElevatedSurface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

// surface-250, matching the plan step's cards.
const CARD_ELEVATION = 5;

interface SignalCardProps {
  signal: OnboardingSignal;
  selected: boolean;
  recommended: boolean;
  onToggle: () => void;
}

export default function SignalCard({ signal, selected, recommended, onToggle }: SignalCardProps) {
  const { name, description, icon: Icon } = signal;
  return (
    <ElevatedSurface level={CARD_ELEVATION} asChild>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={cn(
          "grid grid-cols-[auto_1fr_auto] content-start items-start gap-x-3 text-left rounded-md p-3 2xl:p-4 transition-colors hover:bg-surface-up sm:grid-cols-[1fr_auto] sm:gap-y-3",
          selected && "ring-1 ring-inset ring-primary"
        )}
      >
        {/* Mobile: icon | text | check in one row. sm+: icon and check on top, text below. */}
        <Icon className={cn("h-5 w-5", recommended ? "text-primary" : "text-muted-foreground")} />
        <div className="flex flex-col gap-1 sm:order-last sm:col-span-2">
          <span className="text-sm 2xl:text-base font-medium text-secondary-foreground">{name}</span>
          <span className="text-xs 2xl:text-sm text-muted-foreground">{description}</span>
          {recommended && (
            <span className="mt-2 self-start text-[10px] 2xl:text-xs px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
              Recommended
            </span>
          )}
        </div>
        <Check className={cn("mt-0.5 h-4 w-4 text-primary", !selected && "invisible")} />
      </button>
    </ElevatedSurface>
  );
}
