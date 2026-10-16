"use client";

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";

import { OnboardingProvider } from "@/components/onboarding/context";
import ConnectStep from "@/components/onboarding/steps/connect-step";
import InviteStep from "@/components/onboarding/steps/invite-step";
import PlanStep from "@/components/onboarding/steps/plan-step";
import SignalsStep from "@/components/onboarding/steps/signals-step";
import SlackStep from "@/components/onboarding/steps/slack-step";
import WorkspaceStep from "@/components/onboarding/steps/workspace-step";
import { ONBOARDING_STEPS, type OnboardingFormValues, type OnboardingStep } from "@/components/onboarding/types";
import { useOnboardingProgress } from "@/components/onboarding/use-onboarding-progress";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useUserContext } from "@/contexts/user-context";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

export interface OnboardingInitialValues {
  workspaceId: string | null;
  projectId: string | null;
  step: OnboardingStep;
  defaultValues: OnboardingFormValues;
  // Recognized company name from the work-email domain; null when unknown.
  companyName: string | null;
  // The Starter card offers a no-card free trial instead of checkout.
  trialAvailable: boolean;
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
        companyName={initial.companyName}
        trialAvailable={initial.trialAvailable}
        initialResources={{ workspaceId: initial.workspaceId, projectId: initial.projectId }}
      >
        <WizardSteps initialStep={initial.step} />
      </OnboardingProvider>
    </FormProvider>
  );
}

function WizardSteps({ initialStep }: { initialStep: OnboardingStep }) {
  const flags = useFeatureFlags();
  // OSS collapses to a single workspace+project step.
  if (!flags[Feature.LAMINAR_CLOUD]) {
    return <OssWorkspaceOnly />;
  }
  return <WizardStepsInner initialStep={initialStep} />;
}

function OssWorkspaceOnly() {
  const router = useRouter();
  return (
    <WorkspaceStep
      stepIndex={0}
      totalSteps={1}
      onComplete={async (result) => {
        if (!result) return;
        const { projectId } = result;
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

function WizardStepsInner({ initialStep }: { initialStep: OnboardingStep }) {
  const form = useFormContext<OnboardingFormValues>();
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  useOnboardingProgress(step);
  const position = Math.max(0, ONBOARDING_STEPS.indexOf(step));
  const onFree = form.watch("currentTier") === "free";

  const move = useCallback(
    (delta: 1 | -1) =>
      setStep((current) => {
        const index = ONBOARDING_STEPS.indexOf(current);
        return ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, Math.max(0, index + delta))];
      }),
    []
  );
  const advance = useCallback(() => move(1), [move]);
  const back = useCallback(() => move(-1), [move]);

  const renderStep = () => {
    const shared = { stepIndex: position, totalSteps: ONBOARDING_STEPS.length };
    switch (step) {
      case "workspace":
        return <WorkspaceStep {...shared} isCloud onComplete={advance} />;
      // No back to the workspace step: the workspace already exists (renamed in settings).
      case "invite":
        return <InviteStep {...shared} onAdvance={advance} />;
      case "signals":
        return <SignalsStep {...shared} onAdvance={advance} onBack={back} />;
      case "slack":
        return <SlackStep {...shared} onAdvance={advance} onBack={back} />;
      case "plan":
        return <PlanStep {...shared} onAdvance={advance} onBack={back} />;
      // A paid plan has applied the invites and signals, so only Free can go back and pick again.
      case "connect":
        return <ConnectStep {...shared} onBack={onFree ? back : undefined} />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      key={step}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={STEP_TRANSITION}
      style={STEP_MOTION_STYLE}
    >
      {renderStep()}
    </motion.div>
  );
}
