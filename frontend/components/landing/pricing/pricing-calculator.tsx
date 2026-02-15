"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

export default function PricingCalculator() {
  const [tokens, setTokens] = useState(100_000_000); // Default 100 million tokens
  const [signalRuns, setSignalRuns] = useState(500);

  // Convert tokens to GB (1 token ≈ 4 bytes)
  const tokensToGB = (tokenCount: number) => {
    const bytes = tokenCount * 4;
    return bytes / (1024 * 1024 * 1024);
  };

  // Logarithmic slider mapping for tokens
  const tokenRanges = [
    { min: 10_000_000, max: 100_000_000, step: 10_000_000, positions: 9 },
    { min: 100_000_000, max: 1_000_000_000, step: 50_000_000, positions: 20 },
    { min: 1_000_000_000, max: 10_000_000_000, step: 1_000_000_000, positions: 10 },
  ];

  // Logarithmic slider mapping for signal runs
  const signalRunRanges = [
    { min: 0, max: 1_000, step: 100, positions: 10 },
    { min: 1_000, max: 10_000, step: 1_000, positions: 9 },
    { min: 10_000, max: 50_000, step: 5_000, positions: 8 },
    { min: 50_000, max: 100_000, step: 10_000, positions: 5 },
  ];

  const positionToValue = (position: number, ranges: typeof tokenRanges): number => {
    let currentPosition = 0;
    for (const range of ranges) {
      if (position < currentPosition + range.positions) {
        const relativePosition = position - currentPosition;
        if (relativePosition === 0) return range.min;
        return range.min + relativePosition * range.step;
      }
      currentPosition += range.positions;
    }
    return ranges[ranges.length - 1].max;
  };

  const valueToPosition = (value: number, ranges: typeof tokenRanges): number => {
    let currentPosition = 0;
    for (const range of ranges) {
      if (value <= range.max) {
        if (value <= range.min) return currentPosition;
        const relativeValue = value - range.min;
        const relativePosition = Math.round(relativeValue / range.step);
        return currentPosition + relativePosition;
      }
      currentPosition += range.positions;
    }
    return currentPosition - 1;
  };

  const tokenMaxPosition = tokenRanges.reduce((sum, r) => sum + r.positions, 0) - 1;
  const signalMaxPosition = signalRunRanges.reduce((sum, r) => sum + r.positions, 0) - 1;

  const currentTokenPosition = valueToPosition(tokens, tokenRanges);
  const currentSignalPosition = valueToPosition(signalRuns, signalRunRanges);

  const calculateTierAndPrice = () => {
    const dataGB = tokensToGB(tokens);

    // Free tier: 1GB data, 100 signal runs
    if (dataGB <= 1 && signalRuns <= 100) {
      return {
        tier: "Free",
        price: 0,
        breakdown: {
          baseTier: "Free",
          basePrice: 0,
          additionalData: 0,
          additionalSignalRuns: 0,
          dataOverageGB: 0,
          signalOverageCount: 0,
          total: 0,
        },
      };
    }

    // Determine best tier based on usage
    // Calculate cost for Hobby
    const hobbyBase = 25;
    const hobbyDataOverage = Math.max(0, dataGB - 3) * 2;
    const hobbySignalOverage = Math.max(0, signalRuns - 1_000) * 0.02;
    const hobbyTotal = hobbyBase + hobbyDataOverage + hobbySignalOverage;

    // Calculate cost for Pro
    const proBase = 150;
    const proDataOverage = Math.max(0, dataGB - 10) * 1.5;
    const proSignalOverage = Math.max(0, signalRuns - 10_000) * 0.015;
    const proTotal = proBase + proDataOverage + proSignalOverage;

    // Pick cheapest tier that fits
    if (hobbyTotal <= proTotal) {
      return {
        tier: "Hobby",
        price: hobbyTotal,
        breakdown: {
          baseTier: "Hobby",
          basePrice: hobbyBase,
          additionalData: hobbyDataOverage,
          additionalSignalRuns: hobbySignalOverage,
          dataOverageGB: Math.max(0, dataGB - 3),
          signalOverageCount: Math.max(0, signalRuns - 1_000),
          total: hobbyTotal,
        },
      };
    }

    return {
      tier: "Pro",
      price: proTotal,
      breakdown: {
        baseTier: "Pro",
        basePrice: proBase,
        additionalData: proDataOverage,
        additionalSignalRuns: proSignalOverage,
        dataOverageGB: Math.max(0, dataGB - 10),
        signalOverageCount: Math.max(0, signalRuns - 10_000),
        total: proTotal,
      },
    };
  };

  const { tier, price, breakdown } = calculateTierAndPrice();

  const formatTokens = (tokenCount: number) => {
    if (tokenCount >= 1_000_000_000) {
      return `${(tokenCount / 1_000_000_000).toFixed(tokenCount % 1_000_000_000 === 0 ? 0 : 1)}B`;
    }
    if (tokenCount >= 1_000_000) {
      return `${(tokenCount / 1_000_000).toFixed(tokenCount % 1_000_000 === 0 ? 0 : 1)}M`;
    }
    if (tokenCount >= 1_000) {
      return `${(tokenCount / 1_000).toFixed(tokenCount % 1_000 === 0 ? 0 : 1)}K`;
    }
    return tokenCount.toLocaleString();
  };

  const formatSignalRuns = (count: number) => {
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(count % 1_000 === 0 ? 0 : 1)}K`;
    }
    return count.toLocaleString();
  };

  const estimatedGB = tokensToGB(tokens);

  return (
    <div className="w-full max-w-2xl mt-24 px-4">
      <h2 className="text-2xl font-semibold mb-6 text-center font-space-grotesk text-landing-text-100">
        Estimate your cost
      </h2>
      <div className="p-8 border border-landing-surface-400 rounded-lg space-y-6">
        {/* Result header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium font-space-grotesk text-landing-text-100">Pricing calculator</h3>
          <div className="flex items-center gap-3">
            <Badge
              variant={tier === "Free" ? "outline" : tier === "Hobby" ? "outlinePrimary" : "default"}
              className="text-sm"
            >
              {tier}
            </Badge>
            <span className="text-2xl font-bold font-space-grotesk text-landing-text-100">
              ${price.toFixed(2)}
              <span className="text-sm font-normal text-landing-text-300"> / mo</span>
            </span>
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-6 font-medium">
          {/* Tokens slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-landing-text-100">Tokens per month</span>
              <span className="font-medium text-landing-text-100">{formatTokens(tokens)} tokens</span>
            </div>
            <div className="text-sm text-landing-text-300 font-semibold">≈ {estimatedGB.toFixed(2)} GB</div>
            <div className="text-xs text-landing-text-400">
              * Based on ~4 bytes per token (approximation, excludes stored images)
            </div>
            <Slider
              value={[currentTokenPosition]}
              max={tokenMaxPosition}
              min={0}
              step={1}
              onValueChange={(value) => setTokens(positionToValue(value[0], tokenRanges))}
              className="w-full"
            />
          </div>

          {/* Signal runs slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-landing-text-100">Signal runs per month</span>
              <span className="font-medium text-landing-text-100">{formatSignalRuns(signalRuns)} runs</span>
            </div>
            <Slider
              value={[currentSignalPosition]}
              max={signalMaxPosition}
              min={0}
              step={1}
              onValueChange={(value) => setSignalRuns(positionToValue(value[0], signalRunRanges))}
              className="w-full"
            />
          </div>
        </div>

        {/* Breakdown */}
        {breakdown && (
          <div className="border-t border-landing-surface-400 pt-4 space-y-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-landing-text-100">
                <span>{breakdown.baseTier} plan base</span>
                <span>${breakdown.basePrice.toFixed(2)}</span>
              </div>

              {breakdown.additionalData > 0 && (
                <div className="flex justify-between text-landing-text-300">
                  <span>Data overage ({breakdown.dataOverageGB.toFixed(2)} GB)</span>
                  <span>+${breakdown.additionalData.toFixed(2)}</span>
                </div>
              )}

              {breakdown.additionalSignalRuns > 0 && (
                <div className="flex justify-between text-landing-text-300">
                  <span>Signal run overage ({breakdown.signalOverageCount.toLocaleString()} runs)</span>
                  <span>+${breakdown.additionalSignalRuns.toFixed(2)}</span>
                </div>
              )}

              {(breakdown.additionalData > 0 || breakdown.additionalSignalRuns > 0) && (
                <div className="flex justify-between font-medium pt-2 border-t border-landing-surface-400 text-landing-text-100">
                  <span>Total</span>
                  <span>${breakdown.total.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
