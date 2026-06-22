"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useOnboardingContext } from "@/components/onboarding/context";
import StepShell from "@/components/onboarding/step-shell";
import { ONBOARDING_STEPS } from "@/components/onboarding/types";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { AgentTab } from "@/components/traces/placeholder/agent-tab";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { track } from "@/lib/posthog";

const STEP_INDEX = ONBOARDING_STEPS.length - 1;

interface ConnectStepProps {
  onBack?: () => void;
}

export default function ConnectStep({ onBack }: ConnectStepProps) {
  const router = useRouter();
  const { resources } = useOnboardingContext();
  const { isSubmitting, finishOnboarding, beginSubmitting } = useOnboardingActions();
  const [received, setReceived] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const projectId = resources.projectId;

  const goToProject = useCallback(
    async ({ skipped }: { skipped: boolean }) => {
      // Paid users must never strand on /onboarding even if the cookie is gone.
      if (!projectId) {
        router.replace("/projects");
        return;
      }
      // Only record completion once the cookie is actually cleared — a failed
      // DELETE leaves the user pinned to /onboarding, so it isn't "completed".
      if (await finishOnboarding()) {
        track("onboarding", "connect_step_completed", { skipped });
        beginSubmitting();
        router.replace(`/project/${projectId}/traces?onboarding=true`);
      }
    },
    [projectId, router, finishOnboarding, beginSubmitting]
  );

  useEffect(() => {
    if (received) {
      track("onboarding", "first_trace_received", { from_onboarding: true });
      goToProject({ skipped: false });
    }
  }, [received, goToProject]);

  const eventHandlers = useMemo(() => ({ trace_update: () => setReceived(true) }), []);

  useRealtime({
    key: "traces",
    projectId: projectId ?? "",
    enabled: !!projectId,
    onConnect: useCallback(() => setIsConnected(true), []),
    eventHandlers,
  });

  return (
    <StepShell
      stepIndex={STEP_INDEX}
      totalSteps={ONBOARDING_STEPS.length}
      title="Send your first trace"
      description="Copy and paste this prompt to instrument your agent with Laminar."
      onBack={onBack}
      onNext={() => goToProject({ skipped: true })}
      nextLabel="Skip for now"
      isSubmitting={isSubmitting}
    >
      {isConnected && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <span className="text-sm text-secondary-foreground">Listening for incoming traces</span>
        </div>
      )}
      <AgentTab fromOnboarding />
    </StepShell>
  );
}
