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
          "flex flex-col gap-3 text-left rounded-md p-3 2xl:p-4 transition-colors hover:bg-surface-up",
          selected && "ring-1 ring-inset ring-primary"
        )}
      >
        <div className="flex items-center justify-between">
          <Icon className={cn("h-5 w-5", recommended ? "text-primary" : "text-muted-foreground")} />
          {selected && <Check className="h-4 w-4 text-primary" />}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm 2xl:text-base font-medium text-secondary-foreground">{name}</span>
          <span className="text-xs 2xl:text-sm text-muted-foreground">{description}</span>
        </div>
        {recommended && (
          <span className="self-start text-[10px] 2xl:text-xs px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
            Recommended
          </span>
        )}
      </button>
    </ElevatedSurface>
  );
}
