"use client";

import { CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import slackLogo from "@/assets/logo/slack.png";
import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/posthog";

const SLACK_SCOPES = ["chat:write", "chat:write.public", "channels:read", "groups:read", "mpim:read"];

interface SlackStepProps {
  stepIndex: number;
  totalSteps: number;
  workspaceId?: string;
  slackClientId?: string;
  slackRedirectUri?: string;
  slackFeatureEnabled: boolean;
  onNext: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export default function SlackStep({
  stepIndex,
  totalSteps,
  workspaceId,
  slackClientId,
  slackRedirectUri,
  slackFeatureEnabled,
  onNext,
  onBack,
  isSubmitting,
}: SlackStepProps) {
  const { watch } = useFormContext<OnboardingFormValues>();
  const connected = watch("slackConnected");

  const slackUrl = useMemo(() => {
    if (!slackClientId || !slackRedirectUri || !workspaceId) return undefined;
    const state = `${workspaceId}:/onboarding?slack=success`;
    const sp = new URLSearchParams({
      scope: SLACK_SCOPES.join(","),
      client_id: slackClientId,
      state,
      redirect_uri: slackRedirectUri,
    });
    return `https://slack.com/oauth/v2/authorize?${sp}`;
  }, [slackClientId, slackRedirectUri, workspaceId]);

  const slackAvailable = slackFeatureEnabled && !!slackUrl;

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Connect Slack"
      description="Receive signal alerts directly in a Slack channel. This step is optional — you can skip it and add it later."
      onNext={onNext}
      onBack={onBack}
      isSubmitting={isSubmitting}
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
