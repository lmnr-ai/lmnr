import { type OnboardingFormValues } from "@/components/onboarding/types";
import { TIER_RETENTION } from "@/lib/billing/retention";
import {
  formatDataIncluded,
  formatDataOverage,
  formatPrice,
  formatSignalsCount,
  formatSupport,
  tierIncludesSignals,
  TIERS,
} from "@/lib/billing/tiers";

// Onboarding only offers the self-serve tiers; there is no Enterprise option here.
export type OnboardingTier = Extract<OnboardingFormValues["selectedTier"], "free" | "hobby" | "pro">;

export interface PlanOption {
  id: OnboardingTier;
  name: string;
  price: string;
}

export interface PlanColumn {
  plan: PlanOption;
  selected: boolean;
  disabled: boolean;
  isCurrent: boolean;
  // Set when this plan starts as a free trial; shown in the price line.
  trialDays?: number;
}

// `true` / `false` render as a check / dash.
type ComparisonValue = string | boolean;

export interface ComparisonRow {
  label: string;
  values: Record<OnboardingTier, ComparisonValue>;
}

const ONBOARDING_TIERS: OnboardingTier[] = ["free", "hobby", "pro"];

export const PLANS: PlanOption[] = ONBOARDING_TIERS.map((tier) => ({
  id: tier,
  name: TIERS[tier].name,
  price: formatPrice(tier),
}));

const row = (label: string, get: (tier: OnboardingTier) => ComparisonValue): ComparisonRow => ({
  label,
  values: { free: get("free"), hobby: get("hobby"), pro: get("pro") },
});

// Pro-only per the pricing page table (components/landing/pricing/tier-data.ts).
const proOnly = (tier: OnboardingTier) => tier === "pro";

// Only the rows where the tiers differ; the shared features are one line under the table.
export const COMPARISON_ROWS: ComparisonRow[] = [
  row("Data", (t) =>
    TIERS[t].dataOverageRatePerGB > 0
      ? `${formatDataIncluded(t)}, then ${formatDataOverage(t)}`
      : `${formatDataIncluded(t)}, no overage`
  ),
  row("Data access", (t) => TIER_RETENTION[t].durationPlural),
  row("Seats & projects", (t) => (TIERS[t].seats === "Unlimited" ? "Unlimited" : `${TIERS[t].seats} each`)),
  row("Signals", (t) => tierIncludesSignals(t) && `${formatSignalsCount(t)} credit, then usage`),
  row("Event clusters", proOnly),
  row("SOC 2, HIPAA, PII removal", proOnly),
  row("Support", formatSupport),
];

export const SHARED_FEATURES =
  "Every plan includes tracing, search, dashboards, SQL, evaluations, and the agent debugger.";
