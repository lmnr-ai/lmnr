import { type OnboardingFormValues } from "@/components/onboarding/types";
import { retentionLabel } from "@/lib/billing/retention";
import {
  formatDataIncluded,
  formatDataOverage,
  formatPrice,
  formatProjects,
  formatSeats,
  formatSignalsCount,
  formatSignalsOverage,
  formatSupport,
  TIERS,
} from "@/lib/billing/tiers";

export interface PlanFeature {
  label: string;
  sub?: string;
}

export interface PlanOption {
  id: OnboardingFormValues["selectedTier"];
  name: string;
  price: string;
  priceSubtext: string;
  highlight?: boolean;
  features: PlanFeature[];
}

// Onboarding only offers the paid signup tiers (free, hobby, pro) — there is
// no Enterprise option here.
type OnboardingTier = Extract<OnboardingFormValues["selectedTier"], "free" | "hobby" | "pro">;

const buildPlan = (tier: OnboardingTier): PlanOption => {
  const isPaid = TIERS[tier].dataOverageRatePerGB > 0;
  return {
    id: tier,
    name: TIERS[tier].name,
    price: formatPrice(tier),
    priceSubtext: "/ month",
    features: [
      isPaid
        ? { label: `${formatDataIncluded(tier)} ingested data`, sub: `then ${formatDataOverage(tier)}` }
        : { label: `${formatDataIncluded(tier)} ingested data`, sub: "no overage" },
      isPaid
        ? { label: `${formatSignalsCount(tier)} in Signals`, sub: `then ${formatSignalsOverage(tier)}` }
        : { label: `${formatSignalsCount(tier)} in Signals`, sub: "no overage" },
      { label: retentionLabel(tier) },
      { label: formatProjects(tier) },
      { label: formatSeats(tier) },
      { label: formatSupport(tier) },
    ],
  };
};

export const PLANS: PlanOption[] = [buildPlan("free"), buildPlan("hobby"), buildPlan("pro")];
