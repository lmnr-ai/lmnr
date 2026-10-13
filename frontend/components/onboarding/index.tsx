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
import {
  ONBOARDING_STEPS,
  type OnboardingFormValues,
  type OnboardingStep,
  stepIndexOf,
  visibleOnboardingSteps,
} from "@/components/onboarding/types";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useUserContext } from "@/contexts/user-context";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

export interface OnboardingInitialValues {
  workspaceId: string | null;
  projectId: string | null;
  step: number;
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

function WizardSteps({ initialStep }: { initialStep: number }) {
  const searchParams = useSearchParams();
  const flags = useFeatureFlags();
  // OSS collapses to a single workspace+project step; Stripe return is cloud-only.
  if (!flags[Feature.LAMINAR_CLOUD]) {
    return <OssWorkspaceOnly />;
  }
  // Stripe lands back here with ?upgraded=true — return to the plan step to
  // confirm payment, then the user continues to the connect step.
  if (searchParams.get("upgraded") === "true") {
    return <WizardStepsInner initialStep={stepIndexOf("plan")} paymentSuccess />;
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

function WizardStepsInner({ initialStep, paymentSuccess }: { initialStep: number; paymentSuccess?: boolean }) {
  const form = useFormContext<OnboardingFormValues>();
  const [step, setStep] = useState<OnboardingStep>(ONBOARDING_STEPS[initialStep] ?? "workspace");
  // A Stripe return can beat the webhook, so a confirmed payment counts as paid before the tier flips.
  // The step count also follows the plan picked but not yet committed, so it doesn't jump after the plan step.
  const showsPaidSteps =
    paymentSuccess || form.watch("currentTier") !== "free" || form.watch("selectedTier") !== "free";
  const steps = visibleOnboardingSteps(showsPaidSteps);
  const position = Math.max(0, steps.indexOf(step));

  // Read the tier at call time: starting a trial sets it right before advancing.
  const move = useCallback(
    (delta: 1 | -1) =>
      setStep((current) => {
        const list = visibleOnboardingSteps(paymentSuccess || form.getValues("currentTier") !== "free");
        const index = list.indexOf(current);
        if (index === -1) return "connect";
        return list[Math.min(list.length - 1, Math.max(0, index + delta))];
      }),
    [form, paymentSuccess]
  );
  const advance = useCallback(() => move(1), [move]);
  const back = useCallback(() => move(-1), [move]);

  const renderStep = () => {
    const shared = { stepIndex: position, totalSteps: steps.length };
    switch (step) {
      case "workspace":
        return <WorkspaceStep {...shared} isCloud onComplete={advance} />;
      case "plan":
        // No back button: workspace+project creation in the previous step is irreversible.
        return <PlanStep {...shared} onAdvance={advance} paymentSuccess={paymentSuccess} />;
      case "invite":
        // No back button: the plan (trial or payment) is already committed.
        return <InviteStep {...shared} onAdvance={advance} />;
      case "signals":
        return <SignalsStep {...shared} onAdvance={advance} onBack={back} />;
      case "slack":
        return <SlackStep {...shared} onAdvance={advance} onBack={back} />;
      case "connect":
        return <ConnectStep {...shared} onBack={back} />;
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
