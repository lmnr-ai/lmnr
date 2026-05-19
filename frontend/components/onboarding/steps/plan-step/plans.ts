import { type OnboardingFormValues } from "@/components/onboarding/types";

export interface PlanOption {
  id: OnboardingFormValues["selectedTier"];
  name: string;
  price: string;
  priceSubtext: string;
  highlight?: boolean;
  features: string[];
}

export const PLANS: PlanOption[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceSubtext: "/ mo",
    features: ["1 GB data", "1,000 Signals steps", "15 day retention", "1 project / 1 seat"],
  },
  {
    id: "hobby",
    name: "Hobby",
    price: "$30",
    priceSubtext: "/ mo",
    features: ["3 GB data", "5,000 Signals steps", "30 day retention", "Unlimited projects & seats"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$150",
    priceSubtext: "/ mo",
    features: ["10 GB data", "50,000 Signals steps", "90 day retention", "Slack support"],
  },
];
