import { type RetentionTier } from "@/lib/billing/retention";

// Single source of truth for tier data + display copy. Every pricing
// surface (landing pricing-calculator + pricing-table + cards-variant,
// workspace billing tab, onboarding plan step) reads from here. Numeric
// allowances for hobby/pro MUST stay in sync with `TIER_CONFIG` in
// `lib/actions/checkout/types.ts` (Stripe lookup keys) and the matching
// Rust `WorkspaceTierName` methods in `app-server/src/db/projects.rs`.

export type Tier = RetentionTier; // "free" | "hobby" | "pro" | "enterprise"

interface TierData {
  name: string;
  // null for enterprise — rendered as "Custom". Others are monthly USD.
  basePriceMonthly: number | null;
  // 0 for enterprise — rendered as "Custom" by the formatters.
  includedBytesGB: number;
  includedSignalSteps: number;
  // 0 for tiers without overage (free, enterprise) — rendered as "—".
  dataOverageRatePerGB: number;
  signalOverageRatePerStep: number;
  projects: "1" | "Unlimited";
  seats: "1" | "Unlimited";
  support: "Community" | "Email" | "Slack" | "Dedicated";
}

export const TIERS: Record<Tier, TierData> = {
  free: {
    name: "Free",
    basePriceMonthly: 0,
    includedBytesGB: 1,
    includedSignalSteps: 500,
    dataOverageRatePerGB: 0,
    signalOverageRatePerStep: 0,
    projects: "1",
    seats: "1",
    support: "Community",
  },
  hobby: {
    name: "Hobby",
    basePriceMonthly: 30,
    includedBytesGB: 3,
    includedSignalSteps: 5_000,
    dataOverageRatePerGB: 2,
    signalOverageRatePerStep: 0.0075,
    projects: "Unlimited",
    seats: "Unlimited",
    support: "Email",
  },
  pro: {
    name: "Pro",
    basePriceMonthly: 150,
    includedBytesGB: 10,
    includedSignalSteps: 50_000,
    dataOverageRatePerGB: 1.5,
    signalOverageRatePerStep: 0.005,
    projects: "Unlimited",
    seats: "Unlimited",
    support: "Slack",
  },
  enterprise: {
    name: "Enterprise",
    basePriceMonthly: null,
    includedBytesGB: 0,
    includedSignalSteps: 0,
    dataOverageRatePerGB: 0,
    signalOverageRatePerStep: 0,
    projects: "Unlimited",
    seats: "Unlimited",
    support: "Dedicated",
  },
};

// Display order for surfaces that render tiers as columns/cards.
export const TIER_ORDER: Tier[] = ["free", "hobby", "pro", "enterprise"];

// `$2` for whole-number rates, `$1.50` for one-decimal rates. Centralised so
// every pricing surface uses the same currency formatting (no drift between
// "$2/GB" on landing and "$2.00/GB" in workspace billing).
const formatGBRate = (rate: number): string => (rate % 1 === 0 ? `$${rate}` : `$${rate.toFixed(2)}`);

export const formatPrice = (tier: Tier): string => {
  const p = TIERS[tier].basePriceMonthly;
  return p === null ? "Custom" : `$${p}`;
};

export const formatDataIncluded = (tier: Tier): string =>
  tier === "enterprise" ? "Custom" : `${TIERS[tier].includedBytesGB} GB`;

export const formatDataOverage = (tier: Tier): string => {
  if (tier === "enterprise") return "Custom";
  const rate = TIERS[tier].dataOverageRatePerGB;
  return rate === 0 ? "—" : `${formatGBRate(rate)} / GB`;
};

export const formatSignalsCount = (tier: Tier): string =>
  tier === "enterprise" ? "Custom" : TIERS[tier].includedSignalSteps.toLocaleString();

// Plain `$${rate}` works because the source numbers (0.0075, 0.005) already
// stringify to the desired decimal precision. Don't round through toFixed —
// it'd silently turn $0.0075 into $0.01.
const signalOverageRate = (tier: Tier): string => {
  if (tier === "enterprise") return "Custom";
  const rate = TIERS[tier].signalOverageRatePerStep;
  return rate === 0 ? "—" : `$${rate}`;
};

// "/ Signals step" — used by the cards-style surfaces (landing pricing cards,
// onboarding plans, workspace billing tier cards). Verbose enough to stand
// on its own without column context.
export const formatSignalsOverage = (tier: Tier): string => {
  const rate = signalOverageRate(tier);
  if (rate === "Custom" || rate === "—") return rate;
  return `${rate} / Signals step`;
};

// "/ step" — used by the comparison-table column cells where the row label
// ("Signals step overage rate") already supplies context and column width is
// tight.
export const formatSignalsOverageShort = (tier: Tier): string => {
  const rate = signalOverageRate(tier);
  if (rate === "Custom" || rate === "—") return rate;
  return `${rate} / step`;
};

export const formatSupport = (tier: Tier): string => `${TIERS[tier].support} support`;

export const formatProjects = (tier: Tier): string =>
  TIERS[tier].projects === "Unlimited" ? "Unlimited projects" : `${TIERS[tier].projects} project`;

export const formatSeats = (tier: Tier): string =>
  TIERS[tier].seats === "Unlimited" ? "Unlimited seats" : `${TIERS[tier].seats} seat`;

// Compact form used by the workspace billing tier cards — "1 project / 1
// seat" for free, "Unlimited projects / seats" for everyone else. The other
// surfaces render projects + seats on separate bullets via `formatProjects` /
// `formatSeats`.
export const formatProjectsAndSeats = (tier: Tier): string =>
  TIERS[tier].projects === "Unlimited"
    ? "Unlimited projects / seats"
    : `${TIERS[tier].projects} project / ${TIERS[tier].seats} seat`;
