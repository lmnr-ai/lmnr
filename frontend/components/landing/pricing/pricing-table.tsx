import { Check, Minus } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { microLabel, subSection } from "../class-names";
import LandingButton from "../landing-button";
import InfoTooltip from "./info-tooltip";
import { FEATURE_GROUPS, type FeatureGroup, type FeatureValue, TIER_COLUMNS } from "./tier-data";

// Flat comparison table, no per-tier highlight, rows grouped by FEATURE_GROUPS.
// `md:overflow-visible` is required for the sticky header: an `overflow-x: auto`
// ancestor breaks page-relative sticky, so mobile trades it for the scroll.
export default function PricingTable() {
  return (
    <div className="w-full overflow-x-auto md:overflow-visible">
      <div
        className="grid min-w-[760px] w-full"
        style={{ gridTemplateColumns: `1.4fr repeat(${TIER_COLUMNS.length}, 1fr)` }}
      >
        {/* Header row — sticky on md+ */}
        <div className="sticky top-0 z-10 bg-surface-150 after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-surface-150 after:to-transparent after:pointer-events-none" />
        {TIER_COLUMNS.map((tier) => (
          <div
            key={tier.id}
            className="sticky top-0 z-10 bg-surface-150 after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-surface-150 after:to-transparent after:pointer-events-none relative px-5 pt-6 pb-5 flex flex-col items-start gap-3"
          >
            <div className="flex flex-col gap-1">
              <p className={cn(subSection, "text-white")}>{tier.name}</p>
              <p className="font-sans text-sm text-foreground-300">
                <span className="text-white">{tier.price}</span>
                {tier.priceSuffix ? ` ${tier.priceSuffix}` : ""}
              </p>
            </div>
            <Link href={tier.ctaHref} className="block w-full">
              <LandingButton variant="outline" size="sm" className="w-full">
                {tier.ctaLabel}
              </LandingButton>
            </Link>
          </div>
        ))}

        {FEATURE_GROUPS.map((group) => (
          <FeatureGroupRows key={group.title} group={group} />
        ))}
      </div>
    </div>
  );
}

function FeatureGroupRows({ group }: { group: FeatureGroup }) {
  return (
    <>
      <div className={cn(microLabel, "col-span-full pl-0 pr-5 pt-10 pb-2")}>{group.title}</div>
      {group.rows.map((row) => (
        <FeatureRowCells key={row.label} row={row} />
      ))}
    </>
  );
}

function FeatureRowCells({ row }: { row: FeatureGroup["rows"][number] }) {
  return (
    <>
      <div className="pl-0 pr-5 py-3 text-sm text-foreground-200 border-t border-surface-300/50">
        <span className="inline-flex items-center gap-1.5">
          {row.label}
          {row.tooltip && <InfoTooltip>{row.tooltip}</InfoTooltip>}
        </span>
      </div>
      {TIER_COLUMNS.map((tier) => (
        <div key={tier.id} className="px-5 py-3 text-sm text-white border-t border-surface-300/50">
          <FeatureCell value={row.values[tier.id]} />
        </div>
      ))}
    </>
  );
}

function FeatureCell({ value }: { value: FeatureValue }) {
  if (value === true) return <Check className="size-4 text-foreground-50" strokeWidth={2.5} />;
  if (value === false || value === null) return <Minus className="size-4 text-foreground-500" />;
  return <span>{value}</span>;
}
