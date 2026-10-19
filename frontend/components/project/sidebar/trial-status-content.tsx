import { format } from "date-fns";
import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button.tsx";
import { useProjectContext } from "@/contexts/project-context";
import { TIER_RETENTION } from "@/lib/billing/retention";
import { TIERS } from "@/lib/billing/tiers";

const KEPT_ON_STARTER = [
  `${TIERS.hobby.includedBytesGB} GB of data a month (Free has ${TIERS.free.includedBytesGB} GB)`,
  `${TIER_RETENTION.hobby.durationPlural} of data access (Free has ${TIER_RETENTION.free.durationPlural})`,
  "Signals and clusters",
  "Slack notifications",
  "Unlimited projects and teammates",
];

interface TrialStatusContentProps {
  endsAt: Date;
  convertsToPaid: boolean;
}

export default function TrialStatusContent({ endsAt, convertsToPaid }: TrialStatusContentProps) {
  const { settingsHref } = useProjectContext();
  return (
    <>
      <span className="font-medium">Your Starter trial ends on {format(endsAt, "MMMM d")}</span>
      {convertsToPaid ? (
        <span className="text-secondary-foreground">
          Starter starts then at ${TIERS.hobby.basePriceMonthly}/month on your saved card.
        </span>
      ) : (
        <>
          <span className="text-secondary-foreground">
            After that, this workspace moves to the Free plan. Upgrade to Starter to keep:
          </span>
          <ul className="flex flex-col gap-1.5 text-xs">
            {KEPT_ON_STARTER.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href={settingsHref("billing")}>
        <Button className="w-full" variant={convertsToPaid ? "outline" : "default"}>
          <span>{convertsToPaid ? "Manage billing" : "Upgrade"}</span>
          <ArrowUpRight className="ml-1 size-3.5" />
        </Button>
      </Link>
    </>
  );
}
