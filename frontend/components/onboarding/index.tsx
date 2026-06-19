"use client";

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { OnboardingProvider } from "@/components/onboarding/context";
import ConnectStep from "@/components/onboarding/steps/connect-step";
import PlanStep from "@/components/onboarding/steps/plan-step";
import SignalsStep from "@/components/onboarding/steps/signals-step";
import SlackStep from "@/components/onboarding/steps/slack-step";
import WorkspaceStep from "@/components/onboarding/steps/workspace-step";
import { ONBOARDING_STEPS, type OnboardingFormValues } from "@/components/onboarding/types";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useUserContext } from "@/contexts/user-context";
import { Feature } from "@/lib/features/features";
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
  const searchParams = useSearchParams();
  const flags = useFeatureFlags();
  // OSS collapses to a single workspace+project step; Stripe return is cloud-only.
  if (!flags[Feature.LAMINAR_CLOUD]) {
    return <OssWorkspaceOnly />;
  }
  // Stripe lands back here with ?upgraded=true — jump straight to the final
  // connect step (the cookie kept the user pinned to /onboarding across checkout).
  if (searchParams.get("upgraded") === "true") {
    return <ConnectStep upgraded />;
  }
  return <WizardStepsInner initialStep={initialStep} />;
}

function OssWorkspaceOnly() {
  const router = useRouter();
  return (
    <WorkspaceStep
      stepIndex={0}
      totalSteps={1}
      onComplete={async ({ projectId }) => {
        // OSS has no cookie to clear; this DELETE is fire-and-forget purely to
        // fire the welcome email when SEND_EMAIL is on. Different semantics from
        await fetch(`/api/projects/${projectId}/onboarding/state`, { method: "DELETE" }).catch(() => null);
        router.replace(`/project/${projectId}/traces?onboarding=true`);
      }}
    />
  );
}

const STEP_MOTION_STYLE = { willChange: "opacity" } as const;
const STEP_TRANSITION = { duration: 0.18, ease: "easeOut" } as const;

function WizardStepsInner({ initialStep }: { initialStep: number }) {
  const [stepIndex, setStepIndex] = useState(initialStep);
  const advance = useCallback(() => setStepIndex((i) => Math.min(TOTAL_STEPS - 1, i + 1)), []);
  const back = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  const renderStep = () => {
    switch (stepIndex) {
      case 0:
        return <WorkspaceStep stepIndex={0} totalSteps={TOTAL_STEPS} isCloud onComplete={advance} />;
      case 1:
        // No back button: workspace+project creation in step 0 is irreversible.
        return <SignalsStep stepIndex={1} totalSteps={TOTAL_STEPS} onAdvance={advance} />;
      case 2:
        return <SlackStep stepIndex={2} totalSteps={TOTAL_STEPS} onAdvance={advance} onBack={back} />;
      case 3:
        return <PlanStep stepIndex={3} totalSteps={TOTAL_STEPS} onBack={back} onAdvance={advance} />;
      case 4:
        return <ConnectStep onBack={back} />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      key={stepIndex}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={STEP_TRANSITION}
      style={STEP_MOTION_STYLE}
    >
      {renderStep()}
    </motion.div>
  );
}
