import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { SettingsSection } from "@/components/settings/settings-section";
import { ElevatedSurface } from "@/components/ui/surface";
import {
  DATA_COLOR,
  formatGB,
  formatUsd,
  SIGNALS_COLOR,
  trimZeros,
  type UsageModel,
} from "@/components/workspace/usage/utils";
import { type Tier, TIERS } from "@/lib/billing/tiers";
import { type BillEstimate } from "@/lib/billing/usage-estimate";

import BillLine from "./bill-line";

// Neutral so color only marks usage-driven charges.
const BASE_SWATCH = "bg-surface-up-5";

interface PlanOverviewProps {
  tier: Tier;
  bill: BillEstimate;
  model: UsageModel;
  period: string;
}

export default function PlanOverview({ tier, bill, model, period }: PlanOverviewProps) {
  const { name, dataOverageRatePerGB } = TIERS[tier];
  const { data, signals } = model;
  const allowance = (used: string, included: number | null, fmt: (n: number) => string) =>
    included == null ? `${used} used` : `${used} of ${trimZeros(fmt(included))} included`;
  const signalCredit = signals.credit
    ? ` · ${formatUsd(signals.credit.remaining)} of ${trimZeros(formatUsd(signals.credit.granted))} one-time credit left`
    : "";

  return (
    <SettingsSection>
      <ElevatedSurface className="flex flex-col gap-4 rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Estimated bill · {name} plan</span>
            <span className="text-3xl font-semibold tabular-nums tracking-tight">{formatUsd(bill.totalUsd)}</span>
            <span className="text-xs text-muted-foreground">{period}</span>
          </div>
          <Link
            href="?tab=billing"
            className="text-primary hover:underline inline-flex items-center gap-1 text-sm shrink-0"
          >
            Manage billing
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="flex flex-col divide-y">
          <BillLine
            label={`${name} plan`}
            detail="Monthly base price"
            amountUsd={formatUsd(bill.baseUsd)}
            swatchClassName={BASE_SWATCH}
          />
          <BillLine
            label="Data ingestion"
            detail={`${allowance(formatGB(data.used), data.included, formatGB)} · then ${trimZeros(formatUsd(dataOverageRatePerGB))} / GB`}
            amountUsd={formatUsd(bill.dataOverageUsd)}
            color={DATA_COLOR}
            muted={bill.dataOverageUsd === 0}
          />
          <BillLine
            label="Signals usage"
            detail={
              <>
                {allowance(formatUsd(signals.used), signals.included, formatUsd)}
                {signalCredit} · then billed{" "}
                <Link
                  href="/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  per token
                </Link>
              </>
            }
            amountUsd={formatUsd(bill.signalOverageUsd)}
            color={SIGNALS_COLOR}
            muted={bill.signalOverageUsd === 0}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Based on usage so far this cycle, so it can still grow before the cycle resets.
        </p>
      </ElevatedSurface>
    </SettingsSection>
  );
}
