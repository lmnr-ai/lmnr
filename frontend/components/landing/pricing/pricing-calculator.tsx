"use client";

import { Info } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TOKEN_STEPS = [
  100_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000, 350_000_000, 400_000_000, 450_000_000, 500_000_000,
  1_000_000_000, 2_500_000_000, 5_000_000_000, 10_000_000_000, 15_000_000_000, 20_000_000_000, 25_000_000_000,
  35_000_000_000, 50_000_000_000, 75_000_000_000, 100_000_000_000, 250_000_000_000, 300_000_000_000, 333_333_333_334,
  400_000_000_000, 500_000_000_000, 1_000_000_000_000, 1_666_666_666_667,
];
const SIGNAL_STEPS = [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000];

const BYTES_PER_TOKEN = 3;
const PRO_DATA_THRESHOLD_GB = 30;
const ENTERPRISE_DATA_THRESHOLD_GB = 1000;
const ENTERPRISE_SIGNAL_THRESHOLD = 100_000;

interface TierEstimate {
  name: string;
  basePrice: number;
  includedDataGB: number;
  includedSignals: number;
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

function buildEstimate(
  name: string,
  basePrice: number,
  includedDataGB: number,
  includedSignals: number,
  dataOverageRate: number,
  signalOverageRate: number,
  dataGB: number,
  signalRuns: number,
  retention: string,
  support: string
): TierEstimate {
  const dataOverageCost = Math.max(0, dataGB - includedDataGB) * dataOverageRate;
  const signalOverageCost = Math.max(0, signalRuns - includedSignals) * signalOverageRate;
  return {
    name,
    basePrice,
    includedDataGB,
    includedSignals,
    dataOverageRate,
    signalOverageRate,
    dataOverageCost,
    signalOverageCost,
    total: basePrice + dataOverageCost + signalOverageCost,
    retention,
    support,
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

function RecommendedBadge({ tooltip }: { tooltip?: string }) {
  if (tooltip) {
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

  return (
    <Badge variant="default" className="text-xs shrink-0">
      Recommended
    </Badge>
  );
}

function TierColumn({
  estimate,
  isRecommended,
  recommendationTooltip,
  dataGB,
  signalRuns,
}: {
  estimate: TierEstimate;
  isRecommended: boolean;
  recommendationTooltip?: string;
  dataGB: number;
  signalRuns: number;
}) {
  const extraDataGB = Math.max(0, dataGB - estimate.includedDataGB);
  const extraSignals = Math.max(0, signalRuns - estimate.includedSignals);

  return (
    <div
      className={cn(
        "flex-1 rounded-lg p-4 space-y-3",
        isRecommended ? "border border-landing-primary-400" : "border border-landing-surface-400"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-landing-text-100 font-space-grotesk text-2xl">{estimate.name}</span>
        {isRecommended && <RecommendedBadge tooltip={recommendationTooltip} />}
      </div>

      <div className="space-y-1.5 text-sm">
        <div>
          <div className="flex justify-between text-landing-text-200">
            <span>Base</span>
            <span>${formatDollars(estimate.basePrice)}</span>
          </div>
          <div className="text-xs text-landing-text-400">
            {formatDataSize(estimate.includedDataGB)} + {formatNumber(estimate.includedSignals)} runs included
          </div>
        </div>

        {estimate.dataOverageCost > 0 ? (
          <div className="flex justify-between text-landing-text-300">
            <span>
              {formatDataSize(extraDataGB)} × ${estimate.dataOverageRate}/GB
            </span>
            <span>+${formatDollars(estimate.dataOverageCost)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-landing-text-300">
            <span>Data ({formatDataSize(dataGB)})</span>
            <span>Included</span>
          </div>
        )}

        {estimate.signalOverageCost > 0 ? (
          <div className="flex justify-between text-landing-text-300">
            <span>
              {formatNumber(extraSignals)} × ${estimate.signalOverageRate}/run
            </span>
            <span>+${formatDollars(estimate.signalOverageCost)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-landing-text-300">
            <span>Signals ({formatNumber(signalRuns)})</span>
            <span>Included</span>
          </div>
        )}
      </div>

      <div className="border-t border-landing-surface-400 pt-2">
        <div className="flex justify-between font-semibold text-landing-text-100 font-space-grotesk">
          <span>Total</span>
          <span>${formatDollars(estimate.total)}/mo</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <span className="inline-flex items-center rounded-md border border-landing-primary-400/40 bg-landing-primary-400/10 px-2.5 py-1 text-xs font-semibold text-landing-text-100">
          {estimate.retention} retention
        </span>
        <span className="inline-flex items-center rounded-md border border-landing-primary-400/40 bg-landing-primary-400/10 px-2.5 py-1 text-xs font-semibold text-landing-text-100">
          {estimate.support} support
        </span>
      </div>
    </div>
  );
}

function EnterpriseTierColumn({
  isRecommended,
  recommendationTooltip,
}: {
  isRecommended: boolean;
  recommendationTooltip?: string;
}) {
  return (
    <div
      className={cn(
        "flex-1 rounded-lg p-4 space-y-3",
        isRecommended ? "border border-landing-primary-400" : "border border-landing-surface-400"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-landing-text-100 font-space-grotesk text-2xl">Enterprise</span>
        {isRecommended && <RecommendedBadge tooltip={recommendationTooltip} />}
      </div>

      <div className="space-y-1.5 text-sm">
        <div>
          <div className="flex justify-between text-landing-text-200">
            <span>Base</span>
            <span>Custom</span>
          </div>
          <div className="text-xs text-landing-text-400">1 TB data + 100,000 runs included</div>
        </div>
        <div className="flex justify-between text-landing-text-300">
          <span>Data (1 TB)</span>
          <span>Included</span>
        </div>
        <div className="flex justify-between text-landing-text-300">
          <span>Signals (100,000)</span>
          <span>Included</span>
        </div>
      </div>

      <div className="border-t border-landing-surface-400 pt-2">
        <div className="flex justify-between font-semibold text-landing-text-100 font-space-grotesk">
          <span>Total</span>
          <span>Custom</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <span className="inline-flex items-center rounded-md border border-landing-primary-400/40 bg-landing-primary-400/10 px-2.5 py-1 text-xs font-semibold text-landing-text-100">
          Custom retention
        </span>
        <span className="inline-flex items-center rounded-md border border-landing-primary-400/40 bg-landing-primary-400/10 px-2.5 py-1 text-xs font-semibold text-landing-text-100">
          Dedicated support
        </span>
      </div>
    </div>
  );
}

type CalculatorState = "free" | "hobby" | "pro" | "enterprise";

function getCalculatorState(dataGB: number, signalRuns: number, hobbyTotal: number, proTotal: number): CalculatorState {
  if (dataGB <= 1 && signalRuns <= 100) return "free";
  if (dataGB >= ENTERPRISE_DATA_THRESHOLD_GB || signalRuns >= ENTERPRISE_SIGNAL_THRESHOLD) return "enterprise";
  if (dataGB >= PRO_DATA_THRESHOLD_GB || proTotal < hobbyTotal) return "pro";
  return "hobby";
}

export default function PricingCalculator() {
  const [tokenIdx, setTokenIdx] = useState(0);
  const [signalIdx, setSignalIdx] = useState(0);

  const tokens = TOKEN_STEPS[tokenIdx];
  const dataGB = estimateDataFromTokens(tokens);
  const signalRuns = SIGNAL_STEPS[signalIdx];

  const free = buildEstimate("Free", 0, 1, 100, 0, 0, dataGB, signalRuns, "15-day", "Community");
  const hobby = buildEstimate("Hobby", 30, 3, 1_000, 2, 0.02, dataGB, signalRuns, "30-day", "Email");
  const pro = buildEstimate("Pro", 150, 10, 10_000, 1.5, 0.015, dataGB, signalRuns, "90-day", "Slack");

  const state = getCalculatorState(dataGB, signalRuns, hobby.total, pro.total);

  const freeTooltip = "Your usage fits within the Free tier — no payment needed.";
  const hobbyTooltip = "Most teams at this usage level choose Hobby as the safer, more predictable option.";
  const proTooltip = "Most teams at this usage level choose Pro as the safer, more predictable option.";
  const enterpriseTooltip = "Most teams at this scale choose Enterprise as the safer, more cost-effective option.";

  return (
    <div className="w-full max-w-xl mt-16 px-4">
      <div className="p-8 border border-landing-surface-400 rounded-lg space-y-6">
        <h3 className="text-xl font-semibold font-space-grotesk text-landing-text-100">Pricing calculator</h3>

        <div className="space-y-6 font-medium">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-landing-text-100">Tokens per month</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-landing-text-100">{formatTokens(tokens)}</span>
                <span className="text-sm text-landing-text-300">≈ {formatDataSize(dataGB)}</span>
              </div>
            </div>
            <Slider
              value={[tokenIdx]}
              max={TOKEN_STEPS.length - 1}
              min={0}
              step={1}
              onValueChange={(v) => setTokenIdx(v[0])}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-landing-text-100">Signal runs per month</span>
              <span className="font-medium text-landing-text-100">{formatNumber(signalRuns)}</span>
            </div>
            <Slider
              value={[signalIdx]}
              max={SIGNAL_STEPS.length - 1}
              min={0}
              step={1}
              onValueChange={(v) => setSignalIdx(v[0])}
              className="w-full"
            />
          </div>
        </div>

        <div className="border-t border-landing-surface-400 pt-4">
          {state === "free" && (
            <TierColumn
              estimate={free}
              isRecommended
              recommendationTooltip={freeTooltip}
              dataGB={dataGB}
              signalRuns={signalRuns}
            />
          )}
          {state === "hobby" && (
            <TierColumn
              estimate={hobby}
              isRecommended
              recommendationTooltip={hobbyTooltip}
              dataGB={dataGB}
              signalRuns={signalRuns}
            />
          )}
          {state === "pro" && (
            <TierColumn
              estimate={pro}
              isRecommended
              recommendationTooltip={proTooltip}
              dataGB={dataGB}
              signalRuns={signalRuns}
            />
          )}
          {state === "enterprise" && <EnterpriseTierColumn isRecommended recommendationTooltip={enterpriseTooltip} />}
        </div>
      </div>
    </div>
  );
}
