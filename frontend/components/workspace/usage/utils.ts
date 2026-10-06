import { type UsageBreakdown, type WorkspaceStats } from "@/lib/actions/usage/types";
import { normalizeTier, type Tier, TIERS } from "@/lib/billing/tiers";
import { type BillEstimate, billingCycle, type BillingCycle, estimateBill } from "@/lib/billing/usage-estimate";

export const GB_IN_BYTES = 1024 * 1024 * 1024;
const HOUR_MS = 60 * 60 * 1000;

export const DATA_COLOR = "hsl(var(--chart-1))";
export const SIGNALS_COLOR = "hsl(var(--chart-2))";
export const COMPRESSED_OPACITY = 0.3;
export const COMPRESSED_LABEL = "Compressed";
const COMPRESSION_BLOG_URL = "https://laminar.sh/blog/laminar-20x-agent-trace-compression";
export const COMPRESSION_NOTE = {
  text: "Agents resend their message history on every LLM call. Laminar stores it only once.",
  href: COMPRESSION_BLOG_URL,
};

export const formatGB = (gb: number) => {
  if (!isFinite(gb)) return "Unlimited";
  if (gb === 0) return "0 GB";
  if (gb < 0.01) return `${(gb * 1024).toFixed(2)} MB`;
  return `${gb.toFixed(2)} GB`;
};

export const formatUsd = (usd: number) =>
  `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Per-run costs are around a cent, so keep three significant digits.
export const formatUsdPrecise = (usd: number) => (usd > 0 && usd < 0.1 ? `$${usd.toPrecision(3)}` : formatUsd(usd));

export const trimZeros = (formatted: string) => formatted.replace(/\.00(?!\d)/, "");

const trimNumber = (n: number) => Number(n.toFixed(n >= 10 ? 0 : n >= 1 ? 1 : 2)).toLocaleString("en-US");

// Axis steps are round in GB; switch to MB only when GB ticks would be unreadable.
export const formatGBTick = (gb: number) => {
  if (gb === 0) return "0";
  return gb < 0.1 ? `${trimNumber(gb * 1024)} MB` : `${trimNumber(gb)} GB`;
};

export const formatUsdTick = (usd: number) => (usd === 0 ? "$0" : `$${trimNumber(usd)}`);

export const formatCompact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const formatDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Unlike `normalizeTier`, unknown tiers (e.g. self-hosted "unlimited") return null, not "free".
export const knownTier = (tierName?: string): Tier | null => {
  if (!tierName) return null;
  const key = tierName.trim().toLowerCase();
  return ["free", "hobby", "starter", "pro"].includes(key) ? normalizeTier(key) : null;
};

export interface SignalCredit {
  granted: number;
  remaining: number;
}

export interface MeterModel {
  used: number;
  included: number | null;
  credit?: SignalCredit | null;
}

export interface Compression {
  gb: number;
  fraction: number;
}

export interface UsageModel {
  tier: Tier | null;
  cycle: BillingCycle;
  data: MeterModel; // GB
  compression: Compression | null;
  signals: MeterModel; // USD
  bill: BillEstimate | null;
}

export const buildUsageModel = (stats: WorkspaceStats | null, breakdown: UsageBreakdown | undefined): UsageModel => {
  const tier = knownTier(stats?.tierName);
  // Hour-granular "now" keeps the server render and client hydration identical.
  const now = new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
  const cycle = billingCycle(new Date(stats?.resetTime ?? breakdown?.cycleStart ?? now), now);

  const gbUsed = stats?.gbUsedThisMonth ?? 0;
  const gbIncluded = stats?.gbLimit != null && isFinite(stats.gbLimit) ? stats.gbLimit : null;
  const signalUsed = (stats?.signalCostUsedThisMonth ?? 0) / 1_000_000;
  // Self-serve tiers carry a zero recurring Signals allowance; only the one-time credit offsets cost.
  const signalIncluded = stats?.signalCostLimit ? stats.signalCostLimit / 1_000_000 : null;
  const creditGranted = stats?.signalCreditGrantedMicroUsd ?? 0;
  const signalCredit =
    creditGranted > 0
      ? { granted: creditGranted / 1_000_000, remaining: (stats?.signalCreditRemainingMicroUsd ?? 0) / 1_000_000 }
      : null;

  const bill = estimateBill(tier, {
    gbUsed,
    includedGB: gbIncluded ?? (tier ? TIERS[tier].includedBytesGB : 0),
    billableSignalCostMicroUsd: stats?.signalCostOverLimit ?? 0,
  });

  let compression: Compression | null = null;
  if (breakdown) {
    const compressedGB = breakdown.days.reduce((sum, d) => sum + d.compressedBytes, 0) / GB_IN_BYTES;
    compression = { gb: compressedGB, fraction: compressedGB > 0 ? compressedGB / (gbUsed + compressedGB) : 0 };
  }

  return {
    tier,
    cycle,
    bill,
    compression,
    data: {
      used: gbUsed,
      included: gbIncluded,
    },
    signals: {
      used: signalUsed,
      included: signalIncluded,
      credit: signalCredit,
    },
  };
};
