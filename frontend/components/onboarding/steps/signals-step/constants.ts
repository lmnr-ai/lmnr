import { AlertCircle, CheckCircle, Frown, type LucideIcon, Target } from "lucide-react";

export interface OnboardingSignal {
  name: string;
  description: string;
  icon: LucideIcon;
}

export const ONBOARDING_SIGNALS: OnboardingSignal[] = [
  { name: "Failure Detector", description: "Errors, loops and wrong tool calls", icon: AlertCircle },
  { name: "Intent Classifier", description: "What users want to do", icon: Target },
  { name: "Task Evaluator", description: "Whether tasks got done", icon: CheckCircle },
  { name: "Friction Detector", description: "Where users get frustrated", icon: Frown },
];
