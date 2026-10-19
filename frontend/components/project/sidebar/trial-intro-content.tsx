import { format } from "date-fns";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { TRIAL_DAYS } from "@/lib/actions/checkout/types";
import { TIER_RETENTION } from "@/lib/billing/retention";
import { TIERS } from "@/lib/billing/tiers";

const TRIAL_INCLUDES = [
  `${TIERS.hobby.includedBytesGB} GB of data a month`,
  `${TIER_RETENTION.hobby.durationPlural} of data access`,
  "Signals and Slack alerts",
  "Unlimited projects and teammates",
];

interface TrialIntroContentProps {
  endsAt: Date;
  onClose: () => void;
}

// Shown once, opened on its own when the user lands in the project after onboarding.
export default function TrialIntroContent({ endsAt, onClose }: TrialIntroContentProps) {
  return (
    <>
      <span className="font-medium">Your {TRIAL_DAYS}-day Starter trial has started</span>
      <span className="text-secondary-foreground">
        It&apos;s free until {format(endsAt, "MMMM d")}, no credit card needed. Your workspace includes:
      </span>
      <ul className="flex flex-col gap-1.5 text-xs">
        {TRIAL_INCLUDES.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <span className="text-xs text-muted-foreground">You can check your trial here anytime.</span>
      <Button className="w-full" onClick={onClose}>
        Got it
      </Button>
    </>
  );
}
