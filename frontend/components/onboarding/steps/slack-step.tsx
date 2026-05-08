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
import { Badge } from "@/components/ui/badge";
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
  const { recordSlackStep } = useOnboardingActions();
  const connected = watch("slackConnected");

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

  const handleNext = () => {
    recordSlackStep();
    onAdvance();
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Connect Slack"
      description="Receive signal alerts directly in a Slack channel. This step is optional — you can skip it and add it later."
      onNext={handleNext}
      onBack={onBack}
      nextLabel={connected ? "Continue" : "Skip for now"}
    >
      <div className="rounded-lg border border-border bg-background p-4 flex items-center gap-4">
        <Image src={slackLogo} alt="Slack" width={32} height={32} className="shrink-0" unoptimized />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Slack</p>
          <p className="text-xs text-muted-foreground">
            {connected
              ? "Connected — we'll pick up where you left off."
              : slackAvailable
                ? "You'll leave Laminar briefly to authorize the Slack app, then come back here."
                : "Slack integration is not configured in this environment."}
          </p>
        </div>
        <div className="shrink-0">
          {connected ? (
            <Badge className="py-1.5 border-success bg-success/80 gap-1" variant="outline">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            slackAvailable && (
              <a href={slackUrl} onClick={() => track("onboarding", "slack_connect_clicked")}>
                <Button variant="outlinePrimary">Connect Slack</Button>
              </a>
            )
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        After connecting, you can pick a specific Slack channel per signal from the project alert settings.
      </p>
    </StepShell>
  );
}
