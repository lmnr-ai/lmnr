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
export const normalizeTier = (name: string): Tier => {
  const key = name.trim().toLowerCase();
  return key === "hobby" || key === "pro" || key === "enterprise" ? key : "free";
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

// Published per-million-token rates for signal cost overage, in USD. These are
// the advertised defaults shown on every pricing surface and match the
// app-server defaults (`SIGNAL_*_TOKEN_PRICE_PER_MILLION` in
// `app-server/src/env/private/signals.rs`). They apply to every tier except Pro,
// which is metered at the discounted `PRO_*` rates below.
export const SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION = 0.5;
export const SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION = 3;
// Pro gets discounted signal token rates to stay attractive for scale-ups
// running Signals over a large share of their traffic. These feed the actual
// metering path (`signalTokenCostMicroUsd` + app-server
// `signal_token_cost_micro_usd`), so Pro accumulated cost matches what the
// workspace is billed — metering Pro at the standard rate would over-count and
// trip hard limits / soft warnings before the workspace reaches its budget.
// Mirror `PRO_SIGNAL_*_TOKEN_PRICE_PER_MILLION` in `app-server/src/env/private/signals.rs`.
export const PRO_SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION = 0.4;
export const PRO_SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION = 2.5;
// Cache-read input tokens are a subset of the input total billed at a
// discounted rate (0.1x input by default). Mirrors
// `SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION` in
// `app-server/src/env/private/signals.rs`. Pro's cache-read rate is the same
// $0.05 by default but is independently overridable.
export const SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION = 0.05;
export const PRO_SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION = 0.05;

// Mirror the app-server `env::var(...).parse().ok().unwrap_or(DEFAULT)` logic:
// an unset or unparseable override falls back to the published default, a valid
// value (including 0) wins. Only read server-side; in the client bundle these
// non-public envs resolve to undefined and the published default is used.
const resolveRate = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Cost in micro-USD (1e-6 USD) of the given signal token spend, priced at the
// per-token rate for `tier` (Pro is discounted; every other tier uses the
// standard rate). Tokens are persisted raw and priced at read time so a future
// rate change re-prices history. `inputTokens` is the provider prompt total and
// *includes* `cacheReadTokens` as a subset; the cached portion is split out and
// billed at the discounted cache rate while only the fresh remainder is billed
// at the input rate. Mirrors the app-server `signal_token_cost_micro_usd`
// (`app-server/src/utils/mod.rs`) including its env overrides and Pro tiering, so
// that the frontend usage totals and limit checks — which share the
// `workspace_signal_runs_usage_*` caches with the Rust path — agree.
export const signalTokenCostMicroUsd = (
  inputTokens: number,
  cacheReadTokens: number,
  outputTokens: number,
  tier: Tier
): number => {
  const isPro = tier === "pro";
  const inputRate = isPro
    ? resolveRate(process.env.PRO_SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION, PRO_SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION)
    : resolveRate(process.env.SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION, SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION);
  const cacheReadRate = isPro
    ? resolveRate(
        process.env.PRO_SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION,
        PRO_SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION
      )
    : resolveRate(process.env.SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION, SIGNAL_CACHE_READ_TOKEN_PRICE_PER_MILLION);
  const outputRate = isPro
    ? resolveRate(process.env.PRO_SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION, PRO_SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION)
    : resolveRate(process.env.SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION, SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION);
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
    name: "Hobby",
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

// Per-tier published signal token rates (USD / 1M tokens) for pricing-surface
// display. Pro is discounted to stay attractive at scale; everyone else is on
// the standard rate. The metering path (`signalTokenCostMicroUsd`) applies the
// same per-tier rate — see the comment on `PRO_SIGNAL_*_TOKEN_PRICE_PER_MILLION`.
export const signalInputRate = (tier: Tier): number =>
  tier === "pro" ? PRO_SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION : SIGNAL_INPUT_TOKEN_PRICE_PER_MILLION;

export const signalOutputRate = (tier: Tier): number =>
  tier === "pro" ? PRO_SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION : SIGNAL_OUTPUT_TOKEN_PRICE_PER_MILLION;

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

// "$0.50 / 1M input tokens, $3 / 1M output tokens" — overage past the included
// signal budget is billed at the per-million-token rates. Used by cards-style
// surfaces (landing pricing cards, onboarding plans, workspace billing cards).
export const formatSignalsOverage = (tier: Tier): string => {
  if (tier === "enterprise") return "Custom";
  if (tier === "free") return "—";
  return `$${signalInputRate(tier)} / 1M input tokens, $${signalOutputRate(tier)} / 1M output tokens`;
};

// "$0.50 / $3 per 1M tok" — compact form for the comparison-table column cells
// where the row label already supplies context and column width is tight.
export const formatSignalsOverageShort = (tier: Tier): string => {
  if (tier === "enterprise") return "Custom";
  if (tier === "free") return "—";
  return `$${signalInputRate(tier)} / $${signalOutputRate(tier)} per 1M tok`;
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
