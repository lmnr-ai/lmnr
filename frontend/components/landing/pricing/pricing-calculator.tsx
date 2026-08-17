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

// Monthly volume is split across two axes rather than asked for as one total,
// because people know their own numbers in these terms — nobody knows their
// monthly token count offhand, but everyone knows roughly how many runs they do
// and how big a run is. Their product is what the estimate actually prices.
const RUN_STEPS = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const TOKENS_PER_RUN_STEPS = [
  1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000,
];
// Share of runs a Signal analyzes, as a percentage. Most teams run Signals on a
// filtered slice of their traffic, not all of it.
const COVERAGE_STEPS = [1, 5, 10, 25, 50, 75, 100];

// 1,000 runs of 100K tokens = 100M tokens/mo, a small production agent.
const DEFAULT_RUNS_IDX = 3;
const DEFAULT_TOKENS_PER_RUN_IDX = 6;

// Bytes of stored trace data per agent token, fitted to measured traces as a
// saturating exponential decay in the size of the run: y = a·e^(−b·x) + c,
// with x in thousands of tokens (SSE 1.329). A token costs ~2.8 bytes on a
// short run and decays toward ~0.22 on a long one, because long runs repeat
// their context and dedup collapses the repeats.
const BYTES_PER_TOKEN_FIT = { a: 2.548, b: 0.002661, c: 0.2221 };
const BYTES_PER_TOKEN_SHORT_RUN = BYTES_PER_TOKEN_FIT.a + BYTES_PER_TOKEN_FIT.c;

const PRO_DATA_THRESHOLD_GB = 30;
// Once the estimated Hobby bill clears this, Pro is the cheaper/safer pick.
const HOBBY_TO_PRO_BILL_THRESHOLD_USD = 100;
// Enterprise is a bill-size question, not a usage question: whatever the mix of
// data and Signals, once the best self-serve tier bills more than this it is
// cheaper to be quoted.
const ENTERPRISE_BILL_THRESHOLD_USD = 2500;

// Token spend of one Signal run, fitted to the median of measured runs against
// the size of the trace it analyzed (x in thousands of trace tokens).
//
// Neither is proportional to the trace. Laminar compresses each trace before a
// Signal reads it, so input is mostly fixed prompt overhead and grows only as
// √x. Output must saturate: a Signal event is a fixed-shape object, and across
// 1,212 measured runs its median holds near 3-4K from 100K-token traces to
// 10M-token ones. A linear output fit scored marginally worse here and then
// predicted 40K output tokens on a 10M-token trace against 3.4K actual.
const SIGNAL_INPUT_FIT = { a: 892.402, b: 7729.86 }; // y = a·√x + b            SSE 22.1M
const SIGNAL_OUTPUT_FIT = { a: 3575.6, b: 0.000961453, c: 2080.5 }; // y = a·(1−e^(−b·x)) + c  SSE 1.87M

function signalInputTokens(tokensPerRun: number): number {
  return SIGNAL_INPUT_FIT.a * Math.sqrt(tokensPerRun / 1_000) + SIGNAL_INPUT_FIT.b;
}

function signalOutputTokens(tokensPerRun: number): number {
  const { a, b, c } = SIGNAL_OUTPUT_FIT;
  return a * (1 - Math.exp((-b * tokensPerRun) / 1_000)) + c;
}

/** One metered line, read as "used against what the tier includes". */
interface UsageLine {
  label: string;
  /** "0.3 GB / 3 GB". Absent on Enterprise, which has no numbers to show. */
  detail?: string;
  /** "Included", "$5.00", or "Custom". */
  value: string;
}

/** Everything the column renders is pre-formatted here, so the column itself
 *  holds no branches. `totalUsd` is for picking WHICH tier to show and is never
 *  displayed. */
interface TierEstimate {
  name: string;
  base: string;
  usage: UsageLine[];
  total: string;
  badges: string[];
  totalUsd: number;
}

/** Evaluated at the PER-RUN token count, never the monthly total: dedup works
 *  within a trace, so a month of small runs stores far more per token than one
 *  long run of the same total size. */
function bytesPerToken(tokensPerRun: number): number {
  const { a, b, c } = BYTES_PER_TOKEN_FIT;
  return a * Math.exp((-b * tokensPerRun) / 1_000) + c;
}

function estimateDataGB(runs: number, tokensPerRun: number): number {
  return (runs * tokensPerRun * bytesPerToken(tokensPerRun)) / 1_000_000_000;
}

// Dollar cost of running one Signal over `signalCoveragePct`% of the month's
// runs, at the given tier's signal token rates (Pro is discounted). Priced per
// analyzed run, since both fits describe a single Signal run. Returns USD.
function estimateSignalCostUsd(runs: number, tokensPerRun: number, signalCoveragePct: number, tier: Tier): number {
  const analyzedRuns = runs * (signalCoveragePct / 100);
  const inputTokens = analyzedRuns * signalInputTokens(tokensPerRun);
  const outputTokens = analyzedRuns * signalOutputTokens(tokensPerRun);
  return (inputTokens / 1_000_000) * signalInputRate(tier) + (outputTokens / 1_000_000) * signalOutputRate(tier);
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
  };
}

const TOKEN_UNITS = [
  { limit: 1_000_000_000_000, suffix: "T" },
  { limit: 1_000_000_000, suffix: "B" },
  { limit: 1_000_000, suffix: "M" },
  { limit: 1_000, suffix: "K" },
];

/** Needs the K step now that per-run token counts are in the thousands — the
 *  old millions-only floor rendered 100,000 as "0M". One decimal only when it
 *  changes the number, so 2.5M but 3M rather than 3.0M. */
function formatTokens(tokens: number): string {
  const unit = TOKEN_UNITS.find((u) => tokens >= u.limit);
  if (!unit) return String(tokens);
  const n = tokens / unit.limit;
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}${unit.suffix}`;
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

function getCalculatorState(dataGB: number, freeTotal: number, hobbyTotal: number, proTotal: number): CalculatorState {
  if (dataGB <= 1 && freeTotal === 0) return "free";
  const paid =
    dataGB >= PRO_DATA_THRESHOLD_GB || hobbyTotal > HOBBY_TO_PRO_BILL_THRESHOLD_USD || proTotal < hobbyTotal
      ? "pro"
      : "hobby";
  // Judged on the tier the reader would otherwise land on, so the threshold
  // means "your bill", not "some tier's bill".
  const paidTotal = paid === "pro" ? proTotal : hobbyTotal;
  return paidTotal > ENTERPRISE_BILL_THRESHOLD_USD ? "enterprise" : paid;
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
  const [runsIdx, setRunsIdx] = useState(DEFAULT_RUNS_IDX);
  const [tokensPerRunIdx, setTokensPerRunIdx] = useState(DEFAULT_TOKENS_PER_RUN_IDX);
  const [coverageIdx, setCoverageIdx] = useState(COVERAGE_STEPS.length - 1);

  const runs = RUN_STEPS[runsIdx];
  const tokensPerRun = TOKENS_PER_RUN_STEPS[tokensPerRunIdx];
  const dataGB = estimateDataGB(runs, tokensPerRun);
  const coveragePct = COVERAGE_STEPS[coverageIdx];

  // Signal cost is tier-dependent (Pro is discounted), so each estimate prices
  // at its own rate.
  const estimates: Record<CalculatorState, TierEstimate> = {
    free: buildEstimate("free", dataGB, estimateSignalCostUsd(runs, tokensPerRun, coveragePct, "free")),
    hobby: buildEstimate("hobby", dataGB, estimateSignalCostUsd(runs, tokensPerRun, coveragePct, "hobby")),
    pro: buildEstimate("pro", dataGB, estimateSignalCostUsd(runs, tokensPerRun, coveragePct, "pro")),
    enterprise: buildEstimate("enterprise", dataGB, 0),
  };

  const state = getCalculatorState(dataGB, estimates.free.totalUsd, estimates.hobby.totalUsd, estimates.pro.totalUsd);
  const preview = <TierColumn estimate={estimates[state]} tooltip={TOOLTIPS[state]} />;

  return (
    <div className="w-full space-y-6">
      <p className={cn(subSection, "text-white")}>Pricing calculator</p>
      <div className="flex flex-col gap-6 w-full">
        <SliderBlock
          label="Agent runs per month"
          value={runs.toLocaleString()}
          sliderValue={runsIdx}
          max={RUN_STEPS.length - 1}
          onChange={setRunsIdx}
        />
        {/* Spells out the multiplication, since the monthly total is what the
            data allowance is measured against and neither slider shows it. */}
        <SliderBlock
          label="Tokens per agent run"
          value={
            <>
              {formatTokens(tokensPerRun)}{" "}
              <span className="text-sm text-foreground-300">
                × {runs.toLocaleString()} runs = {formatTokens(runs * tokensPerRun)} tokens
              </span>
            </>
          }
          sliderValue={tokensPerRunIdx}
          max={TOKENS_PER_RUN_STEPS.length - 1}
          onChange={setTokensPerRunIdx}
        />
        <SliderBlock
          label="Agent runs analyzed by Signals"
          value={`${coveragePct}%`}
          sliderValue={coverageIdx}
          max={COVERAGE_STEPS.length - 1}
          onChange={setCoverageIdx}
        />
        {preview}
        {/* Values come from the constants and rate helpers the estimate itself
            uses, so the copy cannot drift from the numbers it describes. */}
        <p className={cn(microLabel, "text-foreground-300 text-sm")}>
          This estimate sizes stored trace data from a curve fitted to real traces, where a token costs about{" "}
          {BYTES_PER_TOKEN_SHORT_RUN.toFixed(1)} bytes on a short run and falls toward{" "}
          {BYTES_PER_TOKEN_FIT.c.toFixed(2)} bytes on a long one (long runs repeat their context, and Laminar dedupes
          the repeats). Signal cost comes from the same kind of fit over real Signal runs: at this run size a Signal
          reads about {formatTokens(signalInputTokens(tokensPerRun))} tokens and writes about{" "}
          {formatTokens(signalOutputTokens(tokensPerRun))}, metered at {formatSignalsOverageShort("pro")} on Pro. Data
          past the included allowance is {formatDataOverage("pro")} on Pro.
        </p>
      </div>
    </div>
  );
}
