"use client";

import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ElevatedSurface } from "@/components/ui/surface";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { retentionLabel } from "@/lib/billing/retention";
import {
  formatDataOverage,
  formatSignalsOverageShort,
  signalInputRate,
  signalOutputRate,
  type Tier,
  TIERS,
} from "@/lib/billing/tiers";
import { cn } from "@/lib/utils";

import { microLabel, subSection } from "../class-names";

const TOKEN_STEPS = [
  100_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000, 350_000_000, 400_000_000, 450_000_000, 500_000_000,
  1_000_000_000, 2_500_000_000, 5_000_000_000, 10_000_000_000, 15_000_000_000, 20_000_000_000, 25_000_000_000,
  35_000_000_000, 50_000_000_000, 75_000_000_000, 100_000_000_000, 250_000_000_000, 300_000_000_000, 333_333_333_334,
  400_000_000_000, 500_000_000_000, 1_000_000_000_000, 1_666_666_666_667,
];
// Share of traces a Signal evaluates, as a percentage. Most teams run Signals
// on a filtered slice of their traffic, not all of it.
const COVERAGE_STEPS = [1, 5, 10, 25, 50, 75, 100];

const BYTES_PER_TOKEN = 3;
const PRO_DATA_THRESHOLD_GB = 30;
// Once the estimated Hobby bill clears this, Pro is the cheaper/safer pick.
const HOBBY_TO_PRO_BILL_THRESHOLD_USD = 100;
const ENTERPRISE_DATA_THRESHOLD_GB = 1000;
const ENTERPRISE_SIGNAL_COST_THRESHOLD_USD = 500;

// Signals don't re-read a trace token-for-token. Laminar compresses each trace
// and feeds a Signal only the parts it needs, so the tokens billed are a small
// fraction of the tokens the agent originally spent. On average a trace
// compresses to ~10% of its original size; in practice it's often much smaller
// and depends on the agent. This factor is the share of raw trace tokens that
// reach a Signal as input after compression.
const TRACE_TO_SIGNAL_COMPRESSION = 0.1;
// Signal events are small structured outputs relative to the input they read.
const SIGNAL_OUTPUT_RATIO = 0.02;

// Everything the arithmetic on this page actually assumes, in the order it is
// applied: tokens -> stored bytes -> what a Signal reads -> what it writes ->
// what those tokens cost -> what usage past the allowance costs.
//
// Built from the same constants and rate helpers the estimate uses, so the note
// cannot drift from the numbers it describes. Nothing here is hardcoded prose.
const ASSUMPTIONS = [
  `${BYTES_PER_TOKEN} bytes of stored trace data per agent token`,
  `a Signal reads ${TRACE_TO_SIGNAL_COMPRESSION * 100}% of a trace's tokens, since Laminar compresses each trace and feeds a Signal only the part it needs`,
  `a Signal writes back ${SIGNAL_OUTPUT_RATIO * 100}% of what it reads`,
  `Signal tokens metered at ${formatSignalsOverageShort("hobby")}, discounted to ${formatSignalsOverageShort("pro")} on Pro`,
  `data past the included allowance at ${formatDataOverage("hobby")} on Starter and ${formatDataOverage("pro")} on Pro`,
];

/** One metered line, read as "used against what the tier includes". */
interface UsageLine {
  label: string;
  /** "0.3 GB / 3 GB". Absent on Enterprise, which has no numbers to show. */
  detail?: string;
  /** "Included", "$5.00", or "Custom". */
  value: string;
}

/** Everything the column renders is pre-formatted here, so the column itself
 *  holds no branches. The two raw numbers are for picking WHICH tier to show
 *  and are never displayed. */
interface TierEstimate {
  name: string;
  base: string;
  usage: UsageLine[];
  total: string;
  badges: string[];
  totalUsd: number;
  signalCostUsd: number;
}

function estimateDataFromTokens(tokens: number): number {
  return (tokens * BYTES_PER_TOKEN) / 1_000_000_000;
}

// Dollar cost of running Signals over `signalCoverage`% of `tokens` trace
// tokens, after trace compression, at the given tier's signal token rates
// (Pro is discounted). Returns USD.
function estimateSignalCostUsd(tokens: number, signalCoveragePct: number, tier: Tier): number {
  const evaluatedTokens = tokens * (signalCoveragePct / 100);
  const signalInputTokens = evaluatedTokens * TRACE_TO_SIGNAL_COMPRESSION;
  const signalOutputTokens = signalInputTokens * SIGNAL_OUTPUT_RATIO;
  return (
    (signalInputTokens / 1_000_000) * signalInputRate(tier) + (signalOutputTokens / 1_000_000) * signalOutputRate(tier)
  );
}

/** A line costs nothing until usage passes the allowance; past it, the charge
 *  IS the difference, so there is no separate rate to spell out. */
const usageLine = (label: string, used: string, included: string, cost: number): UsageLine => ({
  label,
  detail: `${used} / ${included}`,
  value: cost > 0 ? `$${formatDollars(cost)}` : "Included",
});

function buildEstimate(tier: Tier, dataGB: number, signalCostUsd: number): TierEstimate {
  const t = TIERS[tier];
  // Identical to what both columns used to build by hand — see ./retention.
  const badges = [retentionLabel(tier), `${t.support} support`];

  // Enterprise is quoted, not computed. A null base price is the only thing
  // that distinguishes it, so it needs no separate component.
  if (t.basePriceMonthly === null) {
    return {
      name: t.name,
      base: "Custom",
      usage: [
        { label: "Data", value: "Custom" },
        { label: "Signals", value: "Custom" },
      ],
      total: "Custom",
      badges,
      totalUsd: 0,
      signalCostUsd: 0,
    };
  }

  const dataCost = Math.max(0, dataGB - t.includedBytesGB) * t.dataOverageRatePerGB;
  const signalCost = Math.max(0, signalCostUsd - t.includedSignalCostUsd);
  const totalUsd = t.basePriceMonthly + dataCost + signalCost;

  return {
    name: t.name,
    base: `$${formatDollars(t.basePriceMonthly)}`,
    usage: [
      usageLine("Data", formatDataSize(dataGB), formatDataSize(t.includedBytesGB), dataCost),
      usageLine("Signals", `$${formatDollars(signalCostUsd)}`, `$${t.includedSignalCostUsd}`, signalCost),
    ],
    total: `$${formatDollars(totalUsd)}/mo`,
    badges,
    totalUsd,
    signalCostUsd,
  };
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000_000) {
    const trillions = tokens / 1_000_000_000_000;
    return `${trillions % 1 === 0 ? trillions.toFixed(0) : trillions.toFixed(1)}T`;
  }
  if (tokens >= 1_000_000_000) {
    const billions = tokens / 1_000_000_000;
    return `${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(1)}B`;
  }
  return `${(tokens / 1_000_000).toFixed(0)}M`;
}

function formatDollars(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDataSize(gb: number): string {
  if (gb >= 1000) {
    const tb = gb / 1000;
    return `${tb % 1 === 0 ? tb.toFixed(0) : tb.toFixed(1)} TB`;
  }
  if (gb < 1) return `${gb.toFixed(1)} GB`;
  if (gb % 1 === 0) return `${gb.toFixed(0)} GB`;
  return `${gb.toFixed(1)} GB`;
}

// Tooltip is required — the badge only makes sense paired with a "why this
// tier is recommended" explanation.
function RecommendedBadge({ tooltip }: { tooltip: string }) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outlinePrimary" className="text-xs shrink-0 cursor-help gap-1 h-5 px-2">
            Recommended
            <Info size={11} />
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 text-xs leading-relaxed">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const HEADING = "flex justify-between text-lg leading-6 text-white";
const BADGE = "inline-flex items-center rounded-sm px-2 py-0.5 bg-surface-300 text-sm";

// Every tier renders through here, Enterprise included — the builder already
// resolved "Included" vs a charge vs "Custom", so there is nothing to branch on.
function TierColumn({ estimate, tooltip }: { estimate: TierEstimate; tooltip?: string }) {
  return (
    <ElevatedSurface offset={4} className="h-full rounded p-5 space-y-4">
      <div className={cn(subSection, HEADING)}>
        <span className="flex gap-2.5 items-center">
          Tier
          {tooltip && <RecommendedBadge tooltip={tooltip} />}
        </span>
        <span>{estimate.name}</span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="border-t pt-3">
          <div className={cn(subSection, HEADING)}>
            <span>Base</span>
            <span>{estimate.base}</span>
          </div>
        </div>

        {estimate.usage.map(({ label, detail, value }) => (
          <div key={label} className="flex justify-between text-foreground-200">
            <span>{detail ? `${label} (${detail})` : label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>

      <div className="border-t pt-3">
        <div className={cn(subSection, HEADING)}>
          <span>Total</span>
          <span>{estimate.total}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {estimate.badges.map((badge) => (
          <span key={badge} className={cn(microLabel, BADGE)}>
            {badge}
          </span>
        ))}
      </div>
    </ElevatedSurface>
  );
}

type CalculatorState = "free" | "hobby" | "pro" | "enterprise";

const TOOLTIPS: Record<CalculatorState, string> = {
  free: "Your usage fits within the Free tier. No payment needed.",
  hobby: "Most teams at this usage level choose Starter as the safer, more predictable option.",
  pro: "Most teams at this usage level choose Pro as the safer, more predictable option.",
  enterprise: "Most teams at this scale choose Enterprise as the safer, more cost-effective option.",
};

function getCalculatorState(
  dataGB: number,
  signalCostUsd: number,
  freeTotal: number,
  hobbyTotal: number,
  proTotal: number
): CalculatorState {
  if (dataGB <= 1 && freeTotal === 0) return "free";
  if (dataGB >= ENTERPRISE_DATA_THRESHOLD_GB || signalCostUsd >= ENTERPRISE_SIGNAL_COST_THRESHOLD_USD) {
    return "enterprise";
  }
  if (dataGB >= PRO_DATA_THRESHOLD_GB || hobbyTotal > HOBBY_TO_PRO_BILL_THRESHOLD_USD || proTotal < hobbyTotal) {
    return "pro";
  }
  return "hobby";
}

interface SliderBlockProps {
  label: string;
  value: ReactNode;
  sliderValue: number;
  max: number;
  onChange: (v: number) => void;
  className?: string;
}

const SliderBlock = ({ label, value, sliderValue, max, onChange, className }: SliderBlockProps) => (
  <div className={cn("space-y-2", className)}>
    <div className="flex justify-between">
      <span className="text-white">{label}</span>
      <span className="text-white">{value}</span>
    </div>
    <Slider value={[sliderValue]} max={max} min={0} step={1} onValueChange={(v) => onChange(v[0])} className="w-full" />
  </div>
);

export default function PricingCalculator() {
  const [tokenIdx, setTokenIdx] = useState(0);
  const [coverageIdx, setCoverageIdx] = useState(COVERAGE_STEPS.length - 1);

  const tokens = TOKEN_STEPS[tokenIdx];
  const dataGB = estimateDataFromTokens(tokens);
  const coveragePct = COVERAGE_STEPS[coverageIdx];

  // Signal cost is tier-dependent (Pro is discounted), so each estimate prices
  // at its own rate.
  const estimates: Record<CalculatorState, TierEstimate> = {
    free: buildEstimate("free", dataGB, estimateSignalCostUsd(tokens, coveragePct, "free")),
    hobby: buildEstimate("hobby", dataGB, estimateSignalCostUsd(tokens, coveragePct, "hobby")),
    pro: buildEstimate("pro", dataGB, estimateSignalCostUsd(tokens, coveragePct, "pro")),
    enterprise: buildEstimate("enterprise", dataGB, 0),
  };

  const state = getCalculatorState(
    dataGB,
    estimates.hobby.signalCostUsd,
    estimates.free.totalUsd,
    estimates.hobby.totalUsd,
    estimates.pro.totalUsd
  );
  // Signal cost shown next to the coverage slider tracks the recommended tier's
  // rate so it agrees with the estimate column below.
  const displayedSignalCostUsd = state === "pro" ? estimates.pro.signalCostUsd : estimates.hobby.signalCostUsd;

  const tokensValue = (
    <>
      {formatTokens(tokens)} <span className="text-sm text-foreground-300">≈ {formatDataSize(dataGB)}</span>
    </>
  );

  const tokenSlider = (
    <SliderBlock
      label="Agent tokens per month"
      value={tokensValue}
      sliderValue={tokenIdx}
      max={TOKEN_STEPS.length - 1}
      onChange={setTokenIdx}
    />
  );

  const coverageValue = (
    <>
      {coveragePct}%{" "}
      <span className="text-sm text-foreground-300">≈ ${formatDollars(displayedSignalCostUsd)} in Signals</span>
    </>
  );
  const coverageSlider = (
    <SliderBlock
      label="Traces analyzed by Signals"
      value={coverageValue}
      sliderValue={coverageIdx}
      max={COVERAGE_STEPS.length - 1}
      onChange={setCoverageIdx}
    />
  );

  const preview = <TierColumn estimate={estimates[state]} tooltip={TOOLTIPS[state]} />;

  return (
    <div className="w-full space-y-6">
      <p className={cn(subSection, "text-white")}>Pricing calculator</p>
      <div className="flex flex-col gap-6 w-full">
        {tokenSlider}
        {coverageSlider}
        {preview}
        <div className={cn(microLabel, "text-foreground-300 text-sm space-y-2")}>
          <p>This estimate assumes:</p>
          <ul className="list-disc space-y-1 pl-4">
            {ASSUMPTIONS.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
