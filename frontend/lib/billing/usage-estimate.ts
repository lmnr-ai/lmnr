import { addMonths } from "date-fns";

import { type Tier, TIERS } from "@/lib/billing/tiers";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BillingCycle {
  start: Date;
  end: Date;
  remainingDays: number;
}

export const billingCycle = (cycleStart: Date, now: Date = new Date()): BillingCycle => {
  const end = addMonths(cycleStart, 1);
  return { start: cycleStart, end, remainingDays: Math.max((end.getTime() - now.getTime()) / DAY_MS, 0) };
};

export interface BillEstimate {
  baseUsd: number;
  dataOverageGB: number;
  dataOverageUsd: number;
  signalOverageUsd: number;
  totalUsd: number;
}

export interface BillInputs {
  gbUsed: number;
  includedGB: number;
  // Excludes runs paid for by the one-time Signals credit.
  billableSignalCostMicroUsd: number;
}

// Null for tiers that never bill overage (free, enterprise, custom).
export const estimateBill = (tier: Tier | null, inputs: BillInputs): BillEstimate | null => {
  if (tier !== "hobby" && tier !== "pro") return null;
  const { basePriceMonthly, dataOverageRatePerGB } = TIERS[tier];
  const dataOverageGB = Math.max(inputs.gbUsed - inputs.includedGB, 0);
  const dataOverageUsd = dataOverageGB * dataOverageRatePerGB;
  const signalOverageUsd = Math.max(inputs.billableSignalCostMicroUsd, 0) / 1_000_000;
  const baseUsd = basePriceMonthly ?? 0;
  return {
    baseUsd,
    dataOverageGB,
    dataOverageUsd,
    signalOverageUsd,
    totalUsd: baseUsd + dataOverageUsd + signalOverageUsd,
  };
};

export interface DailyPoint {
  date: string;
  value: number | null;
  total: number | null;
  compressed?: number | null;
}

// Padded to cycle end so the x-axis always spans the whole cycle.
export const buildDailySeries = (
  days: { date: string; value: number; compressed?: number }[],
  cycle: BillingCycle
): DailyPoint[] => {
  const points: DailyPoint[] = [];
  let running = 0;
  for (const d of days) {
    running += d.value;
    points.push({ date: d.date, value: d.value, total: running, compressed: d.compressed });
  }

  const lastDate = days.length > 0 ? Date.parse(`${days[days.length - 1].date}T00:00:00Z`) : cycle.start.getTime();
  for (let t = lastDate + DAY_MS; t < cycle.end.getTime(); t += DAY_MS) {
    points.push({ date: new Date(t).toISOString().slice(0, 10), value: null, total: null });
  }
  return points;
};
