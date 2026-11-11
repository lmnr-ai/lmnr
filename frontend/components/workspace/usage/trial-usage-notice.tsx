import { Gift } from "lucide-react";

import { type ActiveTrialInfo } from "@/lib/actions/checkout/types";
import { SIGNALS_SIGNUP_CREDIT_USD } from "@/lib/billing/tiers";

const formatEndDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// A trial isn't capped at the data allowance, runs Signals only on the one-time credit, and is
// never billed; the paid period counts usage from zero.
export default function TrialUsageNotice({ trial }: { trial: ActiveTrialInfo }) {
  const endsOn = formatEndDate(trial.endsAt);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 max-w-4xl">
      <Gift className="mt-0.5 size-4 shrink-0 text-primary-text" />
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Pro free trial until {endsOn}</span>
        <span className="text-secondary-foreground">
          {trial.convertsToPaid
            ? `Data isn't capped at the included amount during the trial, and none of it is billed. Signals run on the $${SIGNALS_SIGNUP_CREDIT_USD} credit and pause when it's used up. Pro starts on ${endsOn} with usage counted from zero. Start it today from Billing.`
            : `You won't be billed. Data isn't capped at the included amount during the trial. Signals run on the $${SIGNALS_SIGNUP_CREDIT_USD} credit and pause when it's used up.`}
        </span>
      </div>
    </div>
  );
}
