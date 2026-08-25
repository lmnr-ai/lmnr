"use client";

import { type ReactNode, useState } from "react";

import { ElevatedSurface } from "@/components/ui/surface";
import { signalInputRate, signalOutputRate, type Tier, TIER_ORDER, TIERS } from "@/lib/billing/tiers";
import { cn } from "@/lib/utils";

import { microLabel, subSection } from "../class-names";
import VolumeInputs from "./volume-inputs";
import {
  COVERAGE_STEPS,
  DEFAULT_RUNS_IDX,
  DEFAULT_TOKENS_PER_RUN_IDX,
  RUN_STEPS,
  TOKENS_PER_RUN_STEPS,
} from "./volume-inputs/steps";

// Bytes of stored trace data per agent token: a saturating exponential decay
// y = a·e^(−b·x) + c fitted to measured traces, x in thousands of tokens. ~2.8
// bytes on a short run, decaying toward ~0.22 as dedup collapses repeats.
const BYTES_PER_TOKEN_FIT = { a: 2.548, b: 0.002661, c: 0.2221 };

const PRO_DATA_THRESHOLD_GB = 30;
// Once the estimated Hobby bill clears this, Pro is the cheaper/safer pick.
const HOBBY_TO_PRO_BILL_THRESHOLD_USD = 100;
// Enterprise is a bill-size question, not a usage question: whatever the mix of
// data and Signals, once the best self-serve tier bills more than this it is
// cheaper to be quoted.
const ENTERPRISE_BILL_THRESHOLD_USD = 2500;

// Token spend of one Signal run, fitted to the median of measured runs. NEITHER
// term is proportional to the trace: compression leaves input as mostly fixed
// prompt overhead growing as √x, and output saturates because a Signal event is
// a fixed-shape object — its median holds near 3-4K across 1,212 runs.
const SIGNAL_INPUT_FIT = { a: 892.402, b: 7729.86 }; // y = a·√x + b            SSE 22.1M
const SIGNAL_OUTPUT_FIT = { a: 3575.6, b: 0.000961453, c: 2080.5 }; // y = a·(1−e^(−b·x)) + c  SSE 1.87M

function signalInputTokens(tokensPerRun: number): number {
  return SIGNAL_INPUT_FIT.a * Math.sqrt(tokensPerRun / 1_000) + SIGNAL_INPUT_FIT.b;
}

function signalOutputTokens(tokensPerRun: number): number {
  const { a, b, c } = SIGNAL_OUTPUT_FIT;
  return a * (1 - Math.exp((-b * tokensPerRun) / 1_000)) + c;
}

/** One metered line of one tier's column: what the bill picks up, and the
 *  usage that produced it. */
interface UsageCell {
  /** "$5.00", "Included", "Not available", or "Custom". */
  charge: string;
  /** "1.1 GB / 3 GB". Absent on Enterprise, which has no numbers to show. */
  detail?: string;
}

/** Everything a column renders is pre-formatted here, so the table itself holds
 *  no branches. `totalUsd` picks the recommended column and is never shown. */
interface TierEstimate {
  name: string;
  base: string;
  data: UsageCell;
  signals: UsageCell;
  total: string;
  totalUsd: number;
  /** False once usage passes an allowance the tier has no overage rate for —
   *  Free simply stops, it does not bill. This is the whole reason the table
   *  shows four columns instead of one: it puts the ceiling on screen. */
  available: boolean;
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
 *  IS the difference, so there is no separate rate to spell out. A tier with no
 *  overage rate cannot bill the difference at all, so it stops instead. */
const usageCell = (used: string, included: string, over: number, overageRate: number): UsageCell => {
  const detail = `${used} / ${included}`;
  if (over > 0 && overageRate === 0) return { charge: "Not available", detail };
  const cost = over * overageRate;
  return { charge: cost > 0 ? `$${formatDollars(cost)}` : "Included", detail };
};

const CUSTOM_CELL: UsageCell = { charge: "Custom" };

function buildEstimate(tier: Tier, dataGB: number, signalCostUsd: number): TierEstimate {
  const t = TIERS[tier];

  // Enterprise is quoted, not computed. A null base price is the only thing
  // that distinguishes it, so it needs no separate component.
  if (t.basePriceMonthly === null) {
    return {
      name: t.name,
      base: "Custom",
      data: CUSTOM_CELL,
      signals: CUSTOM_CELL,
      total: "Custom",
      totalUsd: 0,
      available: true,
    };
  }

  const dataOver = Math.max(0, dataGB - t.includedBytesGB);
  const signalOver = Math.max(0, signalCostUsd - t.includedSignalCostUsd);
  // Signals overage is already priced in dollars, so its "rate" is 1 per dollar
  // — the tier either bills the excess or it does not.
  const signalOverageRate = t.dataOverageRatePerGB > 0 ? 1 : 0;

  const data = usageCell(formatDataSize(dataGB), formatDataSize(t.includedBytesGB), dataOver, t.dataOverageRatePerGB);
  const signals = usageCell(
    `$${formatDollars(signalCostUsd)}`,
    `$${t.includedSignalCostUsd}`,
    signalOver,
    signalOverageRate
  );

  const totalUsd = t.basePriceMonthly + dataOver * t.dataOverageRatePerGB + signalOver * signalOverageRate;
  const available = data.charge !== "Not available" && signals.charge !== "Not available";

  return {
    name: t.name,
    base: `$${formatDollars(t.basePriceMonthly)}`,
    data,
    signals,
    total: available ? `$${formatDollars(totalUsd)}` : "Not available",
    totalUsd,
    available,
  };
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

function recommendTier(dataGB: number, estimates: Record<Tier, TierEstimate>): Tier {
  if (estimates.free.available) return "free";
  const paid =
    dataGB >= PRO_DATA_THRESHOLD_GB ||
    estimates.hobby.totalUsd > HOBBY_TO_PRO_BILL_THRESHOLD_USD ||
    estimates.pro.totalUsd < estimates.hobby.totalUsd
      ? "pro"
      : "hobby";
  // Judged on the tier the reader would otherwise land on, so the threshold
  // means "your bill", not "some tier's bill".
  return estimates[paid].totalUsd > ENTERPRISE_BILL_THRESHOLD_USD ? "enterprise" : paid;
}

// One grid, four tier columns, so the reader compares across a row. Every cell
// is pre-formatted by `buildEstimate`; nothing here branches on a tier.
// EMPHASIS IS THE WHOLE SIGNAL: white is spent on the recommended column and
// nothing else — four equally loud ones are a table you have to read.
const GRID = "min-w-[600px] grid grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]";
const CELL = "px-[14px] py-3 text-left";

const emphasis = (isRecommended: boolean) => (isRecommended ? "text-white" : "text-foreground-400");
const detailEmphasis = (isRecommended: boolean) => (isRecommended ? "text-foreground-300" : "text-foreground-500");

/** Label + one cell per tier. A fragment so every cell is a direct child of the
 *  grid and the columns line up on their own. */
const Row = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <>
    <div className="px-[14px] py-3 text-foreground-200">{label}</div>
    {children}
  </>
);

const UsageValue = ({ cell, isRecommended }: { cell: UsageCell; isRecommended: boolean }) => (
  <div className="flex flex-col items-start gap-0.5">
    <span className={emphasis(isRecommended)}>{cell.charge}</span>
    {cell.detail && <span className={cn("text-xs", detailEmphasis(isRecommended))}>{cell.detail}</span>}
  </div>
);

function TierComparison({ estimates, recommended }: { estimates: Record<Tier, TierEstimate>; recommended: Tier }) {
  return (
    <ElevatedSurface offset={3} className="rounded overflow-x-auto">
      <div className={cn(GRID, "text-sm")}>
        <div className="px-[14px] pt-4 pb-3" />
        {TIER_ORDER.map((tier) => (
          <div key={tier} className="px-[14px] pt-4 pb-3">
            <span className={cn(subSection, "text-base leading-5", emphasis(tier === recommended))}>
              {estimates[tier].name}
            </span>
          </div>
        ))}

        <div className="col-span-5 border-t mx-[14px]" />

        <Row label="Base">
          {TIER_ORDER.map((tier) => (
            <div key={tier} className={cn(CELL, emphasis(tier === recommended))}>
              {estimates[tier].base}
            </div>
          ))}
        </Row>
        <Row label="Data">
          {TIER_ORDER.map((tier) => (
            <div key={tier} className={CELL}>
              <UsageValue cell={estimates[tier].data} isRecommended={tier === recommended} />
            </div>
          ))}
        </Row>
        <Row label="Signals">
          {TIER_ORDER.map((tier) => (
            <div key={tier} className={CELL}>
              <UsageValue cell={estimates[tier].signals} isRecommended={tier === recommended} />
            </div>
          ))}
        </Row>

        <div className="col-span-5 border-t mx-[14px]" />

        <Row label={<span className="text-white">Estimated monthly total</span>}>
          {TIER_ORDER.map((tier) => (
            <div key={tier} className={cn(CELL, "pb-4", emphasis(tier === recommended))}>
              {estimates[tier].total}
              {estimates[tier].available && estimates[tier].totalUsd > 0 && (
                <span className={detailEmphasis(tier === recommended)}>/mo</span>
              )}
            </div>
          ))}
        </Row>
      </div>
    </ElevatedSurface>
  );
}

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
  const estimates: Record<Tier, TierEstimate> = {
    free: buildEstimate("free", dataGB, estimateSignalCostUsd(runs, tokensPerRun, coveragePct, "free")),
    hobby: buildEstimate("hobby", dataGB, estimateSignalCostUsd(runs, tokensPerRun, coveragePct, "hobby")),
    pro: buildEstimate("pro", dataGB, estimateSignalCostUsd(runs, tokensPerRun, coveragePct, "pro")),
    enterprise: buildEstimate("enterprise", dataGB, 0),
  };

  const recommended = recommendTier(dataGB, estimates);

  return (
    <div className="w-full space-y-6">
      <p className={cn(subSection, "text-white")}>Pricing calculator</p>
      <div className="flex flex-col gap-6 w-full">
        {/* Every input the calculator has. Coverage is in there rather than
            here because where it sits relative to the two volume factors is
            part of how the multiplication reads. */}
        <VolumeInputs
          runsIdx={runsIdx}
          tokensPerRunIdx={tokensPerRunIdx}
          coverageIdx={coverageIdx}
          onRunsIdx={setRunsIdx}
          onTokensPerRunIdx={setTokensPerRunIdx}
          onCoverageIdx={setCoverageIdx}
        />
        <TierComparison estimates={estimates} recommended={recommended} />
        <p className={cn(microLabel, "text-foreground-300 text-sm")}>
          Prices above are estimates only. Storage costs are not proportional to token count due to trace compression.
          Signals are billed by tokens used during analysis by our internal Signals Agent. Estimates above are based on
          real production trace size and cost data.
        </p>
      </div>
    </div>
  );
}
