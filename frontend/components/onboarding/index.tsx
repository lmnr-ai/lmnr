"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { OnboardingProvider } from "@/components/onboarding/context";
import NotificationsStep from "@/components/onboarding/steps/notifications-step";
import PlanStep from "@/components/onboarding/steps/plan-step";
import SignalsStep from "@/components/onboarding/steps/signals-step";
import SlackStep from "@/components/onboarding/steps/slack-step";
import WorkspaceStep from "@/components/onboarding/steps/workspace-step";
import { ONBOARDING_STEPS, type OnboardingFormValues } from "@/components/onboarding/types";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

const TOTAL_STEPS = ONBOARDING_STEPS.length;

export interface OnboardingInitialValues {
  workspaceId: string | null;
  projectId: string | null;
  step: number;
  defaultValues: OnboardingFormValues;
}

interface OnboardingWizardProps {
  initial: OnboardingInitialValues;
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function OnboardingWizard({ initial, slackClientId, slackRedirectUri }: OnboardingWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const user = useUserContext();

  const form = useForm<OnboardingFormValues>({
    defaultValues: {
      ...initial.defaultValues,
      // Only synthesize a workspace name from the user's name when hydration
      // didn't supply one (i.e. fresh start, no workspace yet).
      workspaceName: initial.defaultValues.workspaceName || (user.name ? `${user.name}'s workspace` : ""),
      slackConnected: initial.defaultValues.slackConnected || searchParams.get("slack") === "success",
    },
    mode: "onChange",
  });

  useEffect(() => {
    track("onboarding", "page_viewed");
    // Mark the user as in-progress as soon as the wizard mounts. The proxy
    // reads the cookie's presence to keep them on /onboarding until they
    // finish (or the cookie expires). Server Components can't reliably set
    // cookies in Next.js 16, so this runs from the client.
    void fetch("/api/onboarding/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: initial.workspaceId,
        projectId: initial.projectId,
        step: initial.step,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slack OAuth callback returns with ?slack=success|error appended by
  // /api/integrations/slack. Lift it into form state and strip it from the URL.
  useEffect(() => {
    const slackResult = searchParams.get("slack");
    if (slackResult === "success") {
      form.setValue("slackConnected", true);
      toast({ title: "Slack connected", description: "You'll receive signal alerts in Slack." });
    } else if (slackResult === "error") {
      toast({
        variant: "destructive",
        title: "Slack connection failed",
        description: "Please try again or skip for now.",
      });
    }
    if (slackResult) {
      const params = new URLSearchParams(searchParams);
      params.delete("slack");
      const query = params.toString();
      router.replace(`/onboarding${query ? `?${query}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FormProvider {...form}>
      <OnboardingProvider
        slackClientId={slackClientId}
        slackRedirectUri={slackRedirectUri}
        initialResources={{ workspaceId: initial.workspaceId, projectId: initial.projectId }}
      >
        <WizardSteps initialStep={initial.step} />
      </OnboardingProvider>
    </FormProvider>
  );
}

function WizardSteps({ initialStep }: { initialStep: number }) {
  const [stepIndex, setStepIndex] = useState(initialStep);
  const advance = useCallback(() => setStepIndex((i) => Math.min(TOTAL_STEPS - 1, i + 1)), []);
  const back = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  switch (stepIndex) {
    case 0:
      return <WorkspaceStep stepIndex={0} totalSteps={TOTAL_STEPS} onAdvance={advance} />;
    case 1:
      // Step 0 created a workspace and project — those are irreversible, so
      // we deliberately don't expose a back button on step 1.
      return <SignalsStep stepIndex={1} totalSteps={TOTAL_STEPS} onAdvance={advance} />;
    case 2:
      return <NotificationsStep stepIndex={2} totalSteps={TOTAL_STEPS} onAdvance={advance} onBack={back} />;
    case 3:
      return <SlackStep stepIndex={3} totalSteps={TOTAL_STEPS} onAdvance={advance} onBack={back} />;
    case 4:
      return <PlanStep stepIndex={4} totalSteps={TOTAL_STEPS} onBack={back} />;
    default:
      return null;
  }
}
