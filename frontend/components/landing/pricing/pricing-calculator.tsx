"use client";

import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { retentionLabel, TIER_RETENTION } from "@/lib/billing/retention";
import { signalInputRate, signalOutputRate, type Tier, TIERS } from "@/lib/billing/tiers";
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

interface TierEstimate {
  name: string;
  basePrice: number;
  includedDataGB: number;
  includedSignalCostUsd: number;
  dataOverageRate: number;
  dataOverageCost: number;
  signalCostUsd: number;
  signalOverageCost: number;
  total: number;
  retention: string;
  support: string;
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

function buildEstimate(tier: Tier, dataGB: number, signalCostUsd: number): TierEstimate {
  const t = TIERS[tier];
  const basePrice = t.basePriceMonthly ?? 0;
  const dataOverageCost = Math.max(0, dataGB - t.includedBytesGB) * t.dataOverageRatePerGB;
  const signalOverageCost = Math.max(0, signalCostUsd - t.includedSignalCostUsd);
  return {
    name: t.name,
    basePrice,
    includedDataGB: t.includedBytesGB,
    includedSignalCostUsd: t.includedSignalCostUsd,
    dataOverageRate: t.dataOverageRatePerGB,
    dataOverageCost,
    signalCostUsd,
    signalOverageCost,
    total: basePrice + dataOverageCost + signalOverageCost,
    retention: TIER_RETENTION[tier].duration,
    support: t.support,
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
          <Badge variant="default" className="text-xs shrink-0 cursor-help gap-1">
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

// Badge only renders when a tooltip is supplied — keeps the name-only call
// shape valid for any future reuse without a recommendation context.
function TierHeader({ name, tooltip }: { name: string; tooltip?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn(subSection, "text-white")}>{name}</span>
      {tooltip && <RecommendedBadge tooltip={tooltip} />}
    </div>
  );
}

function TierColumn({ estimate, tooltip, dataGB }: { estimate: TierEstimate; tooltip?: string; dataGB: number }) {
  const extraDataGB = Math.max(0, dataGB - estimate.includedDataGB);

  return (
    <div className="bg-surface-500 h-full rounded p-5 space-y-4">
      <TierHeader name={estimate.name} tooltip={tooltip} />

      <div className="space-y-2 text-sm">
        <div>
          <div className="flex justify-between text-white">
            <span>Base</span>
            <span>${formatDollars(estimate.basePrice)}</span>
          </div>
          <div className={cn(microLabel, "mt-0.5 text-foreground-300")}>
            {formatDataSize(estimate.includedDataGB)} + ${estimate.includedSignalCostUsd} in Signals included
          </div>
        </div>

        {estimate.dataOverageCost > 0 ? (
          <div className="flex justify-between text-foreground-200">
            <span>
              {formatDataSize(extraDataGB)} × ${estimate.dataOverageRate}/GB
            </span>
            <span>+${formatDollars(estimate.dataOverageCost)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-foreground-300">
            <span>Data ({formatDataSize(dataGB)})</span>
            <span>Included</span>
          </div>
        )}

        {estimate.signalOverageCost > 0 ? (
          <div className="flex justify-between text-foreground-200">
            <span>
              <span>Signals (${formatDollars(estimate.signalCostUsd)})</span>
            </span>
            <span>+${formatDollars(estimate.signalOverageCost)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-foreground-300">
            <span>Signals (${formatDollars(estimate.signalCostUsd)})</span>
            <span>Included</span>
          </div>
        )}
      </div>

      <div className="border-t pt-3 border-surface-400">
        <div className={cn(subSection, "flex justify-between text-lg leading-6 text-white")}>
          <span>Total</span>
          <span>${formatDollars(estimate.total)}/mo</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={cn(microLabel, "inline-flex items-center rounded-sm px-2 py-0.5 bg-surface-400 text-sm")}>
          {estimate.retention} retention
        </span>
        <span className={cn(microLabel, "inline-flex items-center rounded-sm px-2 py-0.5 bg-surface-400 text-sm")}>
          {estimate.support} support
        </span>
      </div>
    </div>
  );
}

function EnterpriseTierColumn({ tooltip }: { tooltip?: string }) {
  return (
    <div className="bg-surface-500 h-full rounded p-5 space-y-4">
      <TierHeader name="Enterprise" tooltip={tooltip} />

      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-white">
          <span>Base</span>
          <span>Custom</span>
        </div>
        <div className="flex justify-between text-foreground-300">
          <span>Additional data</span>
          <span>Custom</span>
        </div>
        <div className="flex justify-between text-foreground-300">
          <span>Additional Signals usage</span>
          <span>Custom</span>
        </div>
      </div>

      <div className="border-t pt-3 border-surface-400">
        <div className={cn(subSection, "flex justify-between text-lg leading-6 text-white")}>
          <span>Total</span>
          <span>Custom</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={cn(microLabel, "inline-flex items-center rounded-sm px-2 py-0.5 bg-surface-400")}>
          {retentionLabel("enterprise")}
        </span>
        <span className={cn(microLabel, "inline-flex items-center rounded-sm px-2 py-0.5 bg-surface-400")}>
          Dedicated support
        </span>
      </div>
    </div>
  );
}

type CalculatorState = "free" | "hobby" | "pro" | "enterprise";

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
  const free = buildEstimate("free", dataGB, estimateSignalCostUsd(tokens, coveragePct, "free"));
  const hobby = buildEstimate("hobby", dataGB, estimateSignalCostUsd(tokens, coveragePct, "hobby"));
  const pro = buildEstimate("pro", dataGB, estimateSignalCostUsd(tokens, coveragePct, "pro"));

  const state = getCalculatorState(dataGB, hobby.signalCostUsd, free.total, hobby.total, pro.total);
  // Signal cost shown next to the coverage slider tracks the recommended tier's
  // rate so it agrees with the estimate column below.
  const displayedSignalCostUsd = state === "pro" ? pro.signalCostUsd : hobby.signalCostUsd;

  const freeTooltip = "Your usage fits within the Free tier. No payment needed.";
  const hobbyTooltip = "Most teams at this usage level choose Hobby as the safer, more predictable option.";
  const proTooltip = "Most teams at this usage level choose Pro as the safer, more predictable option.";
  const enterpriseTooltip = "Most teams at this scale choose Enterprise as the safer, more cost-effective option.";

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
      label="Traces evaluated by Signals"
      value={coverageValue}
      sliderValue={coverageIdx}
      max={COVERAGE_STEPS.length - 1}
      onChange={setCoverageIdx}
    />
  );

  const preview = (
    <>
      {state === "free" && <TierColumn estimate={free} tooltip={freeTooltip} dataGB={dataGB} />}
      {state === "hobby" && <TierColumn estimate={hobby} tooltip={hobbyTooltip} dataGB={dataGB} />}
      {state === "pro" && <TierColumn estimate={pro} tooltip={proTooltip} dataGB={dataGB} />}
      {state === "enterprise" && <EnterpriseTierColumn tooltip={enterpriseTooltip} />}
    </>
  );

  return (
    <div className="w-full space-y-6">
      <p className={cn(subSection, "text-white")}>Pricing calculator</p>
      <div className="flex flex-col gap-6 w-full">
        {tokenSlider}
        {coverageSlider}
        {preview}
        <p className={cn(microLabel, "text-foreground-300")}>
          Signals are billed by the tokens spent reading a trace, not 1-to-1 with your agent&apos;s token usage —
          Laminar compresses each trace to about 10% of its original size on average (in practice often much smaller,
          depending on the agent) and only feeds a Signal what it needs, so Signals cost is a fraction of the tokens
          above.
        </p>
      </div>
    </div>
  );
}
