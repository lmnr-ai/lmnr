import { AlertCircle, CheckCircle, Frown, type LucideIcon, Target } from "lucide-react";

export interface OnboardingSignal {
  name: string;
  description: string;
  icon: LucideIcon;
}

export const ONBOARDING_SIGNALS: OnboardingSignal[] = [
  {
    name: "Failure Detector",
    description: "Catch logical errors, loops, hallucinations, wrong tool calls, etc.",
    icon: AlertCircle,
  },
  { name: "Intent Classifier", description: "What users want to do", icon: Target },
  { name: "Task Evaluator", description: "Whether a task was successfully completed", icon: CheckCircle },
  { name: "Friction Detector", description: "Whether users get frustrated", icon: Frown },
];
