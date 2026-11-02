import { format } from "date-fns";
import { ArrowUpRight, Bell, Clock, Database, Radio, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button.tsx";
import { useProjectContext } from "@/contexts/project-context";
import { TIER_RETENTION } from "@/lib/billing/retention";
import { TIERS } from "@/lib/billing/tiers";

const TRIAL_INCLUDES = [
  { icon: Radio, label: "Signals" },
  { icon: Bell, label: "Slack alerts for critical events" },
  { icon: Database, label: `${TIERS.hobby.includedBytesGB} GB of data a month` },
  { icon: Clock, label: `${TIER_RETENTION.hobby.durationPlural} of data access` },
  { icon: Users, label: "Unlimited teammates and projects" },
];

interface TrialPopoverContentProps {
  endsAt: Date;
  convertsToPaid: boolean;
  onNavigate: () => void;
}

export default function TrialPopoverContent({ endsAt, convertsToPaid, onNavigate }: TrialPopoverContentProps) {
  const { settingsHref } = useProjectContext();
  const endDate = format(endsAt, "MMMM d");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-medium text-foreground">You&apos;re on a free Starter trial</span>
        <span className="text-[13px] text-muted-foreground">
          We upgraded your workspace to Starter for free until {endDate}, so you can try:
        </span>
      </div>
      <ul className="flex flex-col gap-2 text-[13px] text-secondary-foreground">
        {TRIAL_INCLUDES.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2">
            <Icon className="size-3.5 shrink-0 text-primary-text" />
            <span>{label}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t pt-3 text-[13px] leading-snug text-muted-foreground">
        {convertsToPaid ? (
          <span>
            Starter continues after {endDate} at ${TIERS.hobby.basePriceMonthly}/month on your saved card, with
            pay-as-you-go overage past the included data.
          </span>
        ) : (
          <>
            <span>
              If you don&apos;t upgrade, the trial ends on its own on {endDate} and the workspace moves to the Free
              plan. You won&apos;t be charged.
            </span>
            <span>Upgrade to keep these features and grow past the included data with pay-as-you-go overage.</span>
          </>
        )}
      </div>
      <Link href={settingsHref("billing")} onClick={onNavigate}>
        <Button size="sm" className="h-7 w-full" variant={convertsToPaid ? "outline" : "default"}>
          <span>{convertsToPaid ? "Manage billing" : "Upgrade"}</span>
          <ArrowUpRight className="ml-1 size-3.5" />
        </Button>
      </Link>
    </div>
  );
}
