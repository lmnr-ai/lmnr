export type OnboardingTier = "free" | "hobby" | "pro";

export interface OnboardingFormValues {
  workspaceName: string;
  projectName: string;
  // Queued until the commit on leaving the Slack step; not applied if the workspace stays on Free.
  invites: string[];
  selectedTemplateNames: string[];
  slackConnected: boolean;
  // The project has a linked GitHub repo.
  githubConnected: boolean;
  selectedTier: OnboardingTier;
  // Workspace's actual tier at hydration; never mutated by the user.
  currentTier: OnboardingTier;
}
