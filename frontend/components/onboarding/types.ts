export interface OnboardingFormValues {
  workspaceName: string;
  projectName: string;
  selectedTemplateNames: string[];
  subscribedReportIds: string[];
  slackConnected: boolean;
  selectedTier: "free" | "hobby" | "pro";
}

export const ONBOARDING_STEPS = ["workspace", "signals", "notifications", "plan"] as const;

export const DEFAULT_SELECTED_TEMPLATE_NAMES = ["Failure Detector"] as const;
