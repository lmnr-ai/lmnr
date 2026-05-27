import { retentionLabel } from "@/lib/billing/retention";
import {
  formatDataIncluded,
  formatDataOverage,
  formatPrice,
  formatProjectsAndSeats,
  formatSignalsCount,
  formatSignalsOverage,
  formatSupport,
  type Tier,
  TIER_ORDER,
  TIERS as CENTRAL_TIERS,
} from "@/lib/billing/tiers";

export type TierKey = Tier;

export interface TierInfo {
  name: string;
  price: string;
  priceSubtext: string;
  features: string[];
  // Same length as `features`; entries align by index.
  subfeatures: (string | null)[];
}

const buildInfo = (tier: TierKey): TierInfo => {
  const isEnterprise = tier === "enterprise";
  const priceSubtext = CENTRAL_TIERS[tier].basePriceMonthly === null ? "" : "/ mo";

  if (isEnterprise) {
    return {
      name: CENTRAL_TIERS[tier].name,
      price: formatPrice(tier),
      priceSubtext,
      features: ["Custom limits", "On-premise", formatProjectsAndSeats(tier), formatSupport(tier)],
      subfeatures: [null, null, null, null],
    };
  }

  const hasOverage = CENTRAL_TIERS[tier].dataOverageRatePerGB > 0;
  return {
    name: CENTRAL_TIERS[tier].name,
    price: formatPrice(tier),
    priceSubtext,
    features: [
      `${formatDataIncluded(tier)} data`,
      `${formatSignalsCount(tier)} Signals steps`,
      retentionLabel(tier),
      formatProjectsAndSeats(tier),
      formatSupport(tier),
    ],
    subfeatures: [
      hasOverage ? formatDataOverage(tier) : null,
      hasOverage ? formatSignalsOverage(tier) : null,
      null,
      null,
      null,
    ],
  };
};

export const TIERS: { key: TierKey; info: TierInfo }[] = TIER_ORDER.map((key) => ({
  key,
  info: buildInfo(key),
}));

export function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatShortDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export interface InvoiceLineGroup {
  key: string;
  periodStart: number;
  periodEnd: number;
  lines: { lookupKey: string | null; amount: number; periodStart: number; periodEnd: number }[];
}

export function groupLinesByPeriod(
  lines: { lookupKey: string | null; amount: number; periodStart: number; periodEnd: number }[]
): InvoiceLineGroup[] {
  const groups: InvoiceLineGroup[] = [];

  for (const line of lines) {
    const key = `${line.periodStart}-${line.periodEnd}`;
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.lines.push(line);
    } else {
      groups.push({ key, periodStart: line.periodStart, periodEnd: line.periodEnd, lines: [line] });
    }
  }

  return groups;
}
