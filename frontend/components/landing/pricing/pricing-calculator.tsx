"use client";

import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { retentionLabel, TIER_RETENTION } from "@/lib/billing/retention";
import { type Tier, TIERS } from "@/lib/billing/tiers";
import { cn } from "@/lib/utils";

import { microLabel, subSection } from "../class-names";

const TOKEN_STEPS = [
  100_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000, 350_000_000, 400_000_000, 450_000_000, 500_000_000,
  1_000_000_000, 2_500_000_000, 5_000_000_000, 10_000_000_000, 15_000_000_000, 20_000_000_000, 25_000_000_000,
  35_000_000_000, 50_000_000_000, 75_000_000_000, 100_000_000_000, 250_000_000_000, 300_000_000_000, 333_333_333_334,
  400_000_000_000, 500_000_000_000, 1_000_000_000_000, 1_666_666_666_667,
];
const SIGNAL_STEPS = [1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 500_000];

const BYTES_PER_TOKEN = 3;
const PRO_DATA_THRESHOLD_GB = 30;
const ENTERPRISE_DATA_THRESHOLD_GB = 1000;
const ENTERPRISE_SIGNAL_THRESHOLD = 100_000;

interface TierEstimate {
  name: string;
  basePrice: number;
  includedDataGB: number;
  includedSignalSteps: number;
  dataOverageRate: number;
  signalOverageRate: number;
  dataOverageCost: number;
  signalOverageCost: number;
  total: number;
  retention: string;
  support: string;
}

function estimateDataFromTokens(tokens: number): number {
  return (tokens * BYTES_PER_TOKEN) / 1_000_000_000;
}

function buildEstimate(tier: Tier, dataGB: number, signalStepsProcessed: number): TierEstimate {
  const t = TIERS[tier];
  const basePrice = t.basePriceMonthly ?? 0;
  const dataOverageCost = Math.max(0, dataGB - t.includedBytesGB) * t.dataOverageRatePerGB;
  const signalOverageCost = Math.max(0, signalStepsProcessed - t.includedSignalSteps) * t.signalOverageRatePerStep;
  return {
    name: t.name,
    basePrice,
    includedDataGB: t.includedBytesGB,
    includedSignalSteps: t.includedSignalSteps,
    dataOverageRate: t.dataOverageRatePerGB,
    signalOverageRate: t.signalOverageRatePerStep,
    dataOverageCost,
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

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
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

function TierColumn({
  estimate,
  tooltip,
  dataGB,
  signalStepsProcessed,
}: {
  estimate: TierEstimate;
  tooltip?: string;
  dataGB: number;
  signalStepsProcessed: number;
}) {
  const extraDataGB = Math.max(0, dataGB - estimate.includedDataGB);
  const extraSignals = Math.max(0, signalStepsProcessed - estimate.includedSignalSteps);

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
            {formatDataSize(estimate.includedDataGB)} + {formatNumber(estimate.includedSignalSteps)} Signals steps
            included
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
              {formatNumber(extraSignals)} × ${estimate.signalOverageRate}/step
            </span>
            <span>+${formatDollars(estimate.signalOverageCost)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-foreground-300">
            <span>Signals steps processed ({formatNumber(signalStepsProcessed)})</span>
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
          <span>Additional Signals steps processing</span>
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

function getCalculatorState(dataGB: number, signalRuns: number, hobbyTotal: number, proTotal: number): CalculatorState {
  if (dataGB <= 1 && signalRuns <= 1000) return "free";
  if (dataGB >= ENTERPRISE_DATA_THRESHOLD_GB || signalRuns >= ENTERPRISE_SIGNAL_THRESHOLD) return "enterprise";
  if (dataGB >= PRO_DATA_THRESHOLD_GB || proTotal < hobbyTotal) return "pro";
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
  const [signalIdx, setSignalIdx] = useState(0);

  const tokens = TOKEN_STEPS[tokenIdx];
  const dataGB = estimateDataFromTokens(tokens);
  const signalRuns = SIGNAL_STEPS[signalIdx];

  const free = buildEstimate("free", dataGB, signalRuns);
  const hobby = buildEstimate("hobby", dataGB, signalRuns);
  const pro = buildEstimate("pro", dataGB, signalRuns);

  const state = getCalculatorState(dataGB, signalRuns, hobby.total, pro.total);

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
      label="Tokens per month"
      value={tokensValue}
      sliderValue={tokenIdx}
      max={TOKEN_STEPS.length - 1}
      onChange={setTokenIdx}
    />
  );
  const signalSlider = (
    <SliderBlock
      label="Signals steps per month"
      value={formatNumber(signalRuns)}
      sliderValue={signalIdx}
      max={SIGNAL_STEPS.length - 1}
      onChange={setSignalIdx}
    />
  );

  const preview = (
    <>
      {state === "free" && (
        <TierColumn estimate={free} tooltip={freeTooltip} dataGB={dataGB} signalStepsProcessed={signalRuns} />
      )}
      {state === "hobby" && (
        <TierColumn estimate={hobby} tooltip={hobbyTooltip} dataGB={dataGB} signalStepsProcessed={signalRuns} />
      )}
      {state === "pro" && (
        <TierColumn estimate={pro} tooltip={proTooltip} dataGB={dataGB} signalStepsProcessed={signalRuns} />
      )}
      {state === "enterprise" && <EnterpriseTierColumn tooltip={enterpriseTooltip} />}
    </>
  );

  return (
    <div className="w-full space-y-6">
      <p className={cn(subSection, "text-white")}>Pricing calculator</p>
      <div className="flex flex-col gap-6 w-full">
        {tokenSlider}
        {signalSlider}
        {preview}
      </div>
    </div>
  );
}
