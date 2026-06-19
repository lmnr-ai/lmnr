"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { useOnboardingContext } from "@/components/onboarding/context";
import StepShell from "@/components/onboarding/step-shell";
import { ONBOARDING_STEPS } from "@/components/onboarding/types";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { AgentTab } from "@/components/traces/placeholder/agent-tab";
import { ManualTab } from "@/components/traces/placeholder/manual-tab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { track } from "@/lib/posthog";

const STEP_INDEX = ONBOARDING_STEPS.length - 1;

interface ConnectStepProps {
  // Stripe-paid users land here with ?upgraded=true; show a payment confirmation.
  upgraded?: boolean;
  onBack?: () => void;
}

export default function ConnectStep({ upgraded, onBack }: ConnectStepProps) {
  const router = useRouter();
  const { resources } = useOnboardingContext();
  const { isSubmitting, finishOnboarding, beginSubmitting } = useOnboardingActions();
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

  const firstTraceTracked = useRef(false);
  const eventHandlers = useMemo(
    () => ({
      trace_update: () => {
        // trace_update fires for every incoming trace; only the first is the
        // onboarding "first trace received" milestone.
        if (!firstTraceTracked.current) {
          firstTraceTracked.current = true;
          track("onboarding", "first_trace_received", { from_onboarding: true });
        }
        setIsConnected(true);
      },
    }),
    []
  );

  useRealtime({
    key: "traces",
    projectId: projectId ?? "",
    enabled: !!projectId,
    onConnect: useCallback(() => setIsConnected(true), []),
    eventHandlers,
  });

  const description = upgraded
    ? "Your subscription is active. Run the setup below to start sending traces."
    : "Run one command in your project, or wire up the SDK manually. Your first traces will show up automatically.";

  return (
    <StepShell
      stepIndex={STEP_INDEX}
      totalSteps={ONBOARDING_STEPS.length}
      title="Send your first trace"
      description={description}
      onBack={onBack}
      onNext={() => goToProject({ skipped: false })}
      nextLabel="Go to project"
      isSubmitting={isSubmitting}
      secondaryAction={
        <Button
          type="button"
          variant="ghost"
          className="h-8 text-muted-foreground hover:text-foreground 2xl:h-9 2xl:text-sm"
          onClick={() => goToProject({ skipped: true })}
          disabled={isSubmitting}
        >
          Skip for now
        </Button>
      }
    >
      {upgraded && (
        <div className="flex items-center gap-3 rounded-md border border-success/40 bg-success/5 px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <span className="text-sm text-secondary-foreground">
            Payment received — you can manage billing anytime from workspace settings.
          </span>
        </div>
      )}

      {isConnected && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <span className="text-sm text-primary-foreground">Listening for incoming traces</span>
        </div>
      )}

      <Tabs defaultValue="agent" className="gap-6">
        <TabsList>
          <TabsTrigger value="agent">Coding agent</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
        </TabsList>
        <TabsContent asChild value="agent">
          <AgentTab fromOnboarding />
        </TabsContent>
        <TabsContent asChild value="manual">
          <ManualTab projectId={projectId ?? undefined} />
        </TabsContent>
      </Tabs>
    </StepShell>
  );
}
