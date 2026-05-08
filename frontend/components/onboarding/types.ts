export interface SignalOption {
  id: string;
  name: string;
  shortName: string;
  description: string;
  prompt: string;
  structuredOutputSchema: string;
}

export interface OnboardingFormValues {
  workspaceName: string;
  projectName: string;
  selectedSignalIds: string[];
  emailNotificationsEnabled: boolean;
  slackConnected: boolean;
  selectedTier: "free" | "hobby" | "pro";
}

export const ONBOARDING_STEPS = ["workspace", "signals", "notifications", "slack", "plan"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
