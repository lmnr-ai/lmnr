"use client";

import { CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import slackLogo from "@/assets/logo/slack.png";
import { useOnboardingContext } from "@/components/onboarding/context";
import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { Button } from "@/components/ui/button";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";

const SLACK_SCOPES = ["chat:write", "chat:write.public", "channels:read", "groups:read", "mpim:read"];

interface SlackStepProps {
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
  onBack: () => void;
}

export default function SlackStep({ stepIndex, totalSteps, onAdvance, onBack }: SlackStepProps) {
  const { watch } = useFormContext<OnboardingFormValues>();
  const flags = useFeatureFlags();
  const { resources, slackClientId, slackRedirectUri } = useOnboardingContext();
  const { isSubmitting, saveSlack } = useOnboardingActions();

  const slackConnected = watch("slackConnected");

  const slackUrl = useMemo(() => {
    if (!slackClientId || !slackRedirectUri || !resources.workspaceId) return undefined;
    // returnPath is /onboarding with NO status param — the callback appends
    // slack=success|error itself. Embedding ?slack=success here would mask
    // errors because URLSearchParams.get() returns the first occurrence.
    const state = `${resources.workspaceId}:/onboarding`;
    const sp = new URLSearchParams({
      scope: SLACK_SCOPES.join(","),
      client_id: slackClientId,
      state,
      redirect_uri: slackRedirectUri,
    });
    return `https://slack.com/oauth/v2/authorize?${sp}`;
  }, [slackClientId, slackRedirectUri, resources.workspaceId]);

  const slackAvailable = flags[Feature.SLACK] && !!slackUrl;

  const handleNext = async () => {
    if (await saveSlack()) onAdvance();
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Get Slack alerts when your agent breaks"
      description="Laminar can send Slack notifications (we send email alerts by default) when a critical Signal event is detected, and when new event clusters form. Connect now, or set it up later from workspace settings."
      nextLabel={slackConnected ? "Continue" : "Skip for now"}
      onNext={handleNext}
      onBack={onBack}
      isSubmitting={isSubmitting}
    >
      <div className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
        <div className="my-auto">
          <Image src={slackLogo} alt="Slack" className="mt-0.5 shrink-0 h-7.5 w-7.5 2xl:h-8 2xl:w-8" />
        </div>
        <div className="flex flex-col gap-0 flex-1 min-w-0">
          <span className="text-base font-medium text-secondary-foreground">Slack</span>
          <span className="text-sm text-muted-foreground">
            {slackConnected
              ? "Connected. Pick channels later in workspace settings."
              : slackAvailable
                ? "Connect Slack to your workspace to recieve signal notifications."
                : "Slack integration isn't configured in this environment."}
          </span>
        </div>
        <div className="my-auto shrink-0">
          {slackConnected ? (
            <Button className="border-success bg-success/80 gap-1 hover:bg-success/80 2xl:h-9">
              <CheckCircle2 className="h-4 w-4 2xl:h-5 2xl:w-5" />
              <span className="text-xs 2xl:text-sm">Connected</span>
            </Button>
          ) : (
            slackAvailable && (
              <Button asChild variant="outlinePrimary">
                <a href={slackUrl} onClick={() => track("onboarding", "slack_connect_clicked")}>
                  Connect
                </a>
              </Button>
            )
          )}
        </div>
      </div>
    </StepShell>
  );
}
