import { AlertCircle, Frown, type LucideIcon, Target } from "lucide-react";

export interface OnboardingSignal {
  name: string;
  description: string;
  icon: LucideIcon;
}

export const ONBOARDING_SIGNALS: OnboardingSignal[] = [
  {
    name: "Issues",
    description: "Catch logical errors, loops, hallucinations, wrong tool calls, etc.",
    icon: AlertCircle,
  },
  { name: "Intent", description: "What users want to do", icon: Target },
  { name: "Friction", description: "Whether users get frustrated", icon: Frown },
];
