import { Check, Minus } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { subSection } from "../class-names";
import LandingButton from "../landing-button";
import { FEATURES, type FeatureValue, RECOMMENDED_TIER, TIERS } from "./tier-data";

// The Pro column is fully filled with primary from top to bottom — loudest
// option. Other columns sit transparent with no surface background.
export default function ProFillVariant() {
  return (
    <div className="w-full overflow-x-auto">
      <div className="grid min-w-[760px] w-full" style={{ gridTemplateColumns: `1.4fr repeat(${TIERS.length}, 1fr)` }}>
        {/* Header row */}
        <div />
        {TIERS.map((tier) => {
          const isRecommended = tier.id === RECOMMENDED_TIER;
          return (
            <div
              key={tier.id}
              className={cn(
                "relative px-5 pt-6 pb-5 flex flex-col items-start gap-3",
                isRecommended && "bg-landing-primary-400 rounded-t"
              )}
            >
              <div className="flex flex-col gap-1">
                <p className={cn(subSection, "text-white")}>{tier.name}</p>
                <p className={cn("font-sans text-sm", isRecommended ? "text-white/80" : "text-landing-text-300")}>
                  <span className="text-white">{tier.price}</span>
                  {tier.priceSuffix ? ` ${tier.priceSuffix}` : ""}
                </p>
              </div>
              <Link href={tier.ctaHref} className="block w-full">
                <LandingButton
                  variant={isRecommended ? "primary" : "outline"}
                  size="sm"
                  className={cn(
                    "w-full",
                    isRecommended && "bg-white text-landing-primary-400 border-white/40 hover:bg-white/90"
                  )}
                >
                  {tier.ctaLabel}
                </LandingButton>
              </Link>
            </div>
          );
        })}

        {FEATURES.map((row) => (
          <FeatureRowCells key={row.label} row={row} />
        ))}

        {/* Bottom cap so the Pro fill closes cleanly */}
        <div />
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={cn("h-3", tier.id === RECOMMENDED_TIER && "bg-landing-primary-400 rounded-b")}
          />
        ))}
      </div>
    </div>
  );
}

function FeatureRowCells({ row }: { row: (typeof FEATURES)[number] }) {
  return (
    <>
      <div className="px-5 py-3 text-sm text-landing-text-200 border-t border-landing-surface-500/50">{row.label}</div>
      {TIERS.map((tier) => {
        const isRecommended = tier.id === RECOMMENDED_TIER;
        return (
          <div
            key={tier.id}
            className={cn(
              "px-5 py-3 text-sm border-t",
              isRecommended
                ? "bg-landing-primary-400 text-white border-white/15"
                : "text-white border-landing-surface-500/50"
            )}
          >
            <FeatureCell value={row.values[tier.id]} isRecommended={isRecommended} />
          </div>
        );
      })}
    </>
  );
}

function FeatureCell({ value, isRecommended }: { value: FeatureValue; isRecommended: boolean }) {
  if (value === true) {
    return <Check className={cn("size-4", isRecommended ? "text-white" : "text-landing-text-100")} strokeWidth={2.5} />;
  }
  if (value === false || value === null) {
    return <Minus className={cn("size-4", isRecommended ? "text-white/40" : "text-landing-text-500")} />;
  }
  return <span className={isRecommended ? "text-white" : undefined}>{value}</span>;
}
