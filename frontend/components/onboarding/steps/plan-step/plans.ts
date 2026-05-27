import { type OnboardingFormValues } from "@/components/onboarding/types";
import { retentionLabel } from "@/lib/billing/retention";

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

export const PLANS: PlanOption[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceSubtext: "/ month",
    features: [
      { label: "1 GB ingested data", sub: "no overage" },
      { label: "1,000 Signals steps", sub: "no overage" },
      { label: retentionLabel("free") },
      { label: "1 project" },
      { label: "1 seat" },
      { label: "Community support" },
    ],
  },
  {
    id: "hobby",
    name: "Hobby",
    price: "$30",
    priceSubtext: "/ month",
    features: [
      { label: "3 GB ingested data", sub: "then $2 / GB" },
      { label: "5,000 Signals steps", sub: "then $0.0075 / Signals step" },
      { label: retentionLabel("hobby") },
      { label: "Unlimited projects" },
      { label: "Unlimited seats" },
      { label: "Email support" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$150",
    priceSubtext: "/ month",
    features: [
      { label: "10 GB ingested data", sub: "then $1.50 / GB" },
      { label: "50,000 Signals steps", sub: "then $0.005 / Signals step" },
      { label: retentionLabel("pro") },
      { label: "Unlimited projects" },
      { label: "Unlimited seats" },
      { label: "Slack support" },
    ],
  },
];
