import { Gift } from "lucide-react";

import { type ActiveTrialInfo } from "@/lib/actions/checkout/types";

const formatEndDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// A trial never bills usage: it stays capped at the Starter allowance until Starter starts.
export default function TrialUsageNotice({ trial }: { trial: ActiveTrialInfo }) {
  const endsOn = formatEndDate(trial.endsAt);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 max-w-4xl">
      <Gift className="mt-0.5 size-4 shrink-0 text-primary-text" />
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Starter free trial until {endsOn}</span>
        <span className="text-secondary-foreground">
          {trial.convertsToPaid
            ? `Usage stops at the included 3 GB of data and the $5 Signals credit until Starter starts on ${endsOn}. Start it today from Billing.`
            : "You won't be billed. Usage stops at the included 3 GB of data and the $5 Signals credit."}
        </span>
      </div>
    </div>
  );
}
