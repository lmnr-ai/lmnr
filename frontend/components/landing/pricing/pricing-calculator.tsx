"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

const TOKEN_STEPS = [
  100_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000, 350_000_000, 400_000_000, 450_000_000,
  500_000_000, 1_000_000_000, 2_500_000_000, 5_000_000_000, 10_000_000_000, 25_000_000_000, 50_000_000_000,
  100_000_000_000,
];
const SIGNAL_STEPS = [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000];

const BYTES_PER_TOKEN = 3;

interface Breakdown {
  baseTier: string;
  basePrice: number;
  additionalData: number;
  additionalSignalRuns: number;
  total: number;
}

function estimateDataFromTokens(tokens: number): number {
  return (tokens * BYTES_PER_TOKEN) / 1_000_000_000;
}

function calculateTierAndPrice(dataGB: number, signalRuns: number) {
  if (dataGB <= 1 && signalRuns <= 100) {
    const breakdown: Breakdown = {
      baseTier: "Free",
      basePrice: 0,
      additionalData: 0,
      additionalSignalRuns: 0,
      total: 0,
    };
    return { tier: "Free", breakdown };
  }

  const hobbyData = Math.max(0, dataGB - 3) * 2;
  const hobbySignal = Math.max(0, signalRuns - 1_000) * 0.02;
  const hobbyTotal = 25 + hobbyData + hobbySignal;

  const proData = Math.max(0, dataGB - 10) * 1.5;
  const proSignal = Math.max(0, signalRuns - 10_000) * 0.015;
  const proTotal = 150 + proData + proSignal;

  if (hobbyTotal <= proTotal) {
    const breakdown: Breakdown = {
      baseTier: "Hobby",
      basePrice: 25,
      additionalData: hobbyData,
      additionalSignalRuns: hobbySignal,
      total: hobbyTotal,
    };
    return { tier: "Hobby", breakdown };
  }

  const breakdown: Breakdown = {
    baseTier: "Pro",
    basePrice: 150,
    additionalData: proData,
    additionalSignalRuns: proSignal,
    total: proTotal,
  };
  return { tier: "Pro", breakdown };
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) {
    const billions = tokens / 1_000_000_000;
    return `${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(1)}B`;
  }
  return `${(tokens / 1_000_000).toFixed(0)}M`;
}

function formatNumber(n: number) {
  return n.toLocaleString("en-US");
}

export default function PricingCalculator() {
  const [tokenIdx, setTokenIdx] = useState(0);
  const [signalIdx, setSignalIdx] = useState(0);

  const tokens = TOKEN_STEPS[tokenIdx];
  const dataGB = estimateDataFromTokens(tokens);
  const signalRuns = SIGNAL_STEPS[signalIdx];

  const { tier, breakdown } = calculateTierAndPrice(dataGB, signalRuns);
  const hasOverage = breakdown.additionalData > 0 || breakdown.additionalSignalRuns > 0;

  return (
    <div className="w-full max-w-2xl mt-16 px-4">
      <div className="p-8 border border-landing-surface-400 rounded-lg space-y-6">
        <div className="text-center space-y-2 flex items-center justify-between">
          <h3 className="text-xl font-semibold font-space-grotesk text-landing-text-100">Pricing calculator</h3>
          <div className="flex justify-center items-center gap-2">
            <Badge
              variant={tier === "Free" ? "outline" : tier === "Hobby" ? "outlinePrimary" : "default"}
              className="text-sm"
            >
              {tier}
            </Badge>
            <span className="text-2xl font-bold font-space-grotesk text-landing-text-100">
              ${breakdown.total.toFixed(2)} / month
            </span>
          </div>
        </div>

        <div className="space-y-6 font-medium">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-landing-text-100">Tokens per month</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-landing-text-100">{formatTokens(tokens)}</span>
                <span className="text-sm text-landing-text-300">≈ {dataGB < 1 ? dataGB.toFixed(1) : dataGB.toFixed(0)} GB</span>
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

        <div className="border-t border-landing-surface-400 pt-4 space-y-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-landing-text-100">
              <span>{breakdown.baseTier} tier (base)</span>
              <span>${breakdown.basePrice.toFixed(2)}</span>
            </div>

            {breakdown.additionalData > 0 && (
              <div className="flex justify-between text-landing-text-300">
                <span>Additional data ({(breakdown.additionalData / (tier === "Hobby" ? 2 : 1.5)).toFixed(0)} GB)</span>
                <span>+${breakdown.additionalData.toFixed(2)}</span>
              </div>
            )}

            {breakdown.additionalSignalRuns > 0 && (
              <div className="flex justify-between text-landing-text-300">
                <span>Additional signal runs ({formatNumber(signalRuns - (tier === "Hobby" ? 1_000 : 10_000))})</span>
                <span>+${breakdown.additionalSignalRuns.toFixed(2)}</span>
              </div>
            )}

            {hasOverage && (
              <div className="flex justify-between font-medium pt-2 border-t border-landing-surface-400 text-landing-text-100">
                <span>Total</span>
                <span>${breakdown.total.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
