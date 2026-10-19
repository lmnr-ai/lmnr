import { format } from "date-fns";
import { ArrowUpRight, Bell, Clock, Database, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button.tsx";
import { useProjectContext } from "@/contexts/project-context";
import { TIER_RETENTION } from "@/lib/billing/retention";
import { TIERS } from "@/lib/billing/tiers";

const TRIAL_INCLUDES = [
  { icon: Bell, label: "Signals and Slack alerts" },
  { icon: Database, label: `${TIERS.hobby.includedBytesGB} GB of data a month` },
  { icon: Clock, label: `${TIER_RETENTION.hobby.durationPlural} of data access` },
  { icon: Users, label: "Unlimited teammates" },
];

interface TrialPopoverContentProps {
  endsAt: Date;
  convertsToPaid: boolean;
  onNavigate: () => void;
}

export default function TrialPopoverContent({ endsAt, convertsToPaid, onNavigate }: TrialPopoverContentProps) {
  const { settingsHref } = useProjectContext();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-white">You&apos;re on the Starter trial</span>
        <span className="text-xs text-muted-foreground">
          {convertsToPaid
            ? `Starter continues after ${format(endsAt, "MMMM d")} at $${TIERS.hobby.basePriceMonthly}/month on your saved card.`
            : `Try Signals on your traces, free until ${format(endsAt, "MMMM d")}. Your workspace includes:`}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs text-secondary-foreground">
        {TRIAL_INCLUDES.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2">
            <Icon className="size-3.5 shrink-0 text-primary" />
            <span>{label}</span>
          </li>
        ))}
      </ul>
      {!convertsToPaid && <span className="text-xs text-muted-foreground">Upgrade to keep these features.</span>}
      <Link href={settingsHref("billing")} onClick={onNavigate} className="mt-1">
        <Button size="sm" className="h-7 w-full" variant={convertsToPaid ? "outline" : "default"}>
          <span>{convertsToPaid ? "Manage billing" : "Upgrade"}</span>
          <ArrowUpRight className="ml-1 size-3.5" />
        </Button>
      </Link>
    </div>
  );
}
