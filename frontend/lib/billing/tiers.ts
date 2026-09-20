import { type RetentionTier } from "@/lib/billing/retention";

// Single source of truth for tier data + display copy. Every pricing
// surface (landing pricing-calculator + pricing-table + cards-variant,
// workspace billing tab, onboarding plan step) reads from here. Numeric
// allowances for hobby/pro MUST stay in sync with `TIER_CONFIG` in
// `lib/actions/checkout/types.ts` (Stripe lookup keys) and the matching
// Rust `WorkspaceTierName` methods in `app-server/src/db/projects.rs`.

export type Tier = RetentionTier; // "free" | "hobby" | "pro" | "enterprise"

// Map an arbitrary tier-name string (as stored on `subscription_tiers.name`)
// to the `Tier` union, defaulting unknown values to the standard-rate "free".
// Used by the metering path to select the per-tier signal token rate.
// "Starter" is the display name of the internal "hobby" tier (renamed 2026-07);
// DB rows may carry either name during the rollout.
export const normalizeTier = (name: string): Tier => {
  const key = name.trim().toLowerCase();
  if (key === "starter") return "hobby";
  return key === "hobby" || key === "pro" || key === "enterprise" ? key : "free";
};

// Display name for an arbitrary tier-name string as stored in the DB. Maps
// known tiers through `TIERS` (so a "Hobby" DB row renders as "Starter");
// unknown names (e.g. custom enterprise tier rows like "unlimited") pass
// through unchanged.
export const tierDisplayName = (name: string): string => {
  const key = name.trim().toLowerCase();
  return key === "free" || key === "hobby" || key === "starter" || key === "pro" || key === "enterprise"
    ? TIERS[normalizeTier(name)].name
    : name;
};

interface TierData {
  name: string;
  // null for enterprise — rendered as "Custom". Others are monthly USD.
  basePriceMonthly: number | null;
  // 0 for enterprise — rendered as "Custom" by the formatters.
  includedBytesGB: number;
  // Signal cost included in the monthly plan, in USD. Signals are billed by
  // the token cost the agent spends, so the allowance is a dollar amount,
  // not a step count. 0 for enterprise — rendered as "Custom".
  includedSignalCostUsd: number;
  // 0 for tiers without overage (free, enterprise) — rendered as "—".
  dataOverageRatePerGB: number;
  projects: "1" | "Unlimited";
  seats: "1" | "Unlimited";
  support: "Community" | "Email" | "Slack" | "Dedicated";
}

// Published per-million-token rates for signal cost overage, in USD. Every
// tier currently uses the same defaults. Keep these aligned with the app-server
// signal pricing env defaults before enabling the rates for production billing.
export const SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION = 0.05;
export const SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION = 0.3;
// Cache-read tokens are a subset of input and cost 0.1x the fresh-input rate.
export const SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION = 0.005;

// Mirror the app-server `env::var(...).parse().ok().unwrap_or(DEFAULT)` logic:
// an unset or unparseable override falls back to the published default, a valid
// value (including 0) wins. Only read server-side; in the client bundle these
// non-public envs resolve to undefined and the published default is used.
const resolveRate = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Cost in micro-USD (1e-6 USD) of the given signal token spend. Tokens are
// persisted raw and priced at read time so a future rate change re-prices
// history. `inputTokens` is the provider prompt total and *includes*
// `cacheReadTokens` as a subset; the cached portion is split out and billed at
// the discounted cache rate while only the fresh remainder is billed at the
// input rate. Mirrors the app-server `signal_token_cost_micro_usd`
// (`app-server/src/utils/mod.rs`) including its env overrides, so the frontend
// usage totals and limit checks agree with backend enforcement.
export const signalTokenCostMicroUsd = (inputTokens: number, cacheReadTokens: number, outputTokens: number): number => {
  const inputRate = resolveRate(process.env.SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION, SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION);
  const cacheReadRate = resolveRate(
    process.env.SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION,
    SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION
  );
  const outputRate = resolveRate(
    process.env.SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION,
    SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION
  );
  // Clamp cache reads to the prompt total so malformed provider usage metadata
  // (cache reads above the reported prompt) can never bill more tokens than the
  // prompt actually contained. Mirrors the app-server clamp.
  const clampedCacheReadTokens = Math.min(cacheReadTokens, inputTokens);
  const freshInputTokens = inputTokens - clampedCacheReadTokens;
  return Math.round(freshInputTokens * inputRate + clampedCacheReadTokens * cacheReadRate + outputTokens * outputRate);
};

export const TIERS: Record<Tier, TierData> = {
  free: {
    name: "Free",
    basePriceMonthly: 0,
    includedBytesGB: 1,
    includedSignalCostUsd: 5,
    dataOverageRatePerGB: 0,
    projects: "1",
    seats: "1",
    support: "Community",
  },
  hobby: {
    // Display name only — the internal key stays "hobby" everywhere (Tier
    // union, Stripe lookup keys, subscription_tiers rows, Rust enum).
    name: "Starter",
    basePriceMonthly: 30,
    includedBytesGB: 3,
    includedSignalCostUsd: 15,
    dataOverageRatePerGB: 2,
    projects: "Unlimited",
    seats: "Unlimited",
    support: "Email",
  },
  pro: {
    name: "Pro",
    basePriceMonthly: 150,
    includedBytesGB: 10,
    includedSignalCostUsd: 50,
    dataOverageRatePerGB: 1.5,
    projects: "Unlimited",
    seats: "Unlimited",
    support: "Slack",
  },
  enterprise: {
    name: "Enterprise",
    basePriceMonthly: null,
    includedBytesGB: 0,
    includedSignalCostUsd: 0,
    dataOverageRatePerGB: 0,
    projects: "Unlimited",
    seats: "Unlimited",
    support: "Dedicated",
  },
};

// Display order for surfaces that render tiers as columns/cards.
export const TIER_ORDER: Tier[] = ["free", "hobby", "pro", "enterprise"];

// Published signal token rates (USD / 1M tokens) for pricing surfaces.
export const signalInputRate = (): number => SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION;

export const signalCacheReadRate = (): number => SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION;

export const signalOutputRate = (): number => SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION;

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

// Included signal budget as a dollar amount, e.g. "$15". Signals are billed
// by token cost, so the allowance is denominated in dollars.
export const formatSignalsCount = (tier: Tier): string =>
  tier === "enterprise" ? "Custom" : `$${TIERS[tier].includedSignalCostUsd}`;

// Overage past the included signal budget is billed at per-million-token rates.
// Cached input is listed separately because it is a subset of input charged at
// the lower cache-read rate.
export const formatSignalsOverage = (tier: Tier): string => {
  if (tier === "enterprise") return "Custom";
  if (tier === "free") return "—";
  return `$${signalInputRate()} / 1M input tokens, $${signalCacheReadRate()} / 1M cached input tokens, $${signalOutputRate()} / 1M output tokens`;
};

// Compact form for comparison-table cells where the row label supplies context.
export const formatSignalsOverageShort = (tier: Tier): string => {
  if (tier === "enterprise") return "Custom";
  if (tier === "free") return "—";
  return `$${signalInputRate()} / $${signalCacheReadRate()} cached / $${signalOutputRate()} per 1M tok`;
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
