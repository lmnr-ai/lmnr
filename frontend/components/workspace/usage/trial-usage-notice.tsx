import { Gift } from "lucide-react";

import { type ActiveTrialInfo } from "@/lib/actions/checkout/types";

const formatEndDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// A trial never bills usage: with no card it is capped at the Starter allowance, and with a card
// on file billing only starts when the trial ends.
export default function TrialUsageNotice({ trial }: { trial: ActiveTrialInfo }) {
  const endsOn = formatEndDate(trial.endsAt);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 max-w-4xl">
      <Gift className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Starter free trial until {endsOn}</span>
        <span className="text-secondary-foreground">
          {trial.hasPaymentMethod
            ? `You won't be billed for usage during the trial. Starter billing starts on ${endsOn}.`
            : "You won't be billed: there's no card on file. Usage stops at the included 3 GB of data and the $5 Signals credit until you add a payment method."}
        </span>
      </div>
    </div>
  );
}
