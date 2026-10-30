"use client";

import { CheckCircle2 } from "lucide-react";
import { useFormContext } from "react-hook-form";

import ConnectStatusMessage from "@/components/github/connect-status-message";
import {
  githubInstallHref,
  useGithubConnectStatus,
  useGithubIntegration,
  useProjectGithubRepo,
} from "@/components/github/hooks";
import RepoPicker from "@/components/github/repo-picker";
import { useOnboardingContext } from "@/components/onboarding/context";
import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { Button } from "@/components/ui/button";
import { IconGitHub } from "@/components/ui/icons";
import { track } from "@/lib/posthog";

interface GithubStepProps {
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
  onBack?: () => void;
}

export default function GithubStep({ stepIndex, totalSteps, onAdvance, onBack }: GithubStepProps) {
  const { watch, setValue } = useFormContext<OnboardingFormValues>();
  const { resources } = useOnboardingContext();
  const [status] = useGithubConnectStatus();
  const { data: integration, isLoading } = useGithubIntegration(resources.workspaceId);
  const { data: repo, mutate: mutateRepo } = useProjectGithubRepo(resources.projectId, !!integration);

  const githubConnected = watch("githubConnected") || !!repo;

  const handleNext = () => {
    track("onboarding", "github_step_completed", { githubConnected });
    onAdvance();
  };

  const renderAction = () => {
    if (!resources.projectId || isLoading) return null;
    if (repo) {
      return (
        <Button className="gap-1 border-success-border bg-success/80 hover:bg-success/80 2xl:h-9">
          <CheckCircle2 data-icon="inline-start" className="h-4 w-4 2xl:h-5 2xl:w-5" />
          <span className="text-xs 2xl:text-sm">Connected</span>
        </Button>
      );
    }
    if (integration) {
      return (
        <RepoPicker
          projectId={resources.projectId}
          linkedRepo={null}
          defaultOpen={status === "connected"}
          onLinked={(linked) => {
            setValue("githubConnected", true);
            mutateRepo(linked, { revalidate: false });
          }}
        />
      );
    }
    return (
      <Button asChild variant="outlinePrimary">
        <a
          href={githubInstallHref(resources.projectId, "/onboarding")}
          onClick={() => track("onboarding", "github_connect_clicked")}
        >
          Connect
        </a>
      </Button>
    );
  };

  const description = repo
    ? `Linked to ${repo.repoFullName}.`
    : integration?.suspended
      ? "The Laminar app is suspended on GitHub."
      : integration
        ? `Connected to ${integration.accountLogin}. Pick the repository for this project.`
        : "Pick a repository. The agent reads your code with AI model providers to make changes.";

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Connect your repo and we'll add tracing for you"
      description="Laminar's agent opens a pull request that adds tracing to your code. Connect now, or set it up later from workspace settings."
      nextLabel={githubConnected ? "Continue" : "Skip for now"}
      onNext={handleNext}
      onBack={onBack}
    >
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-400 px-4 py-3">
        <div className="flex items-start gap-3">
          <IconGitHub className="my-auto h-7.5 w-7.5 shrink-0 2xl:h-8 2xl:w-8" />
          <div className="flex min-w-0 flex-1 flex-col gap-0">
            <span className="text-base font-medium text-secondary-foreground">GitHub</span>
            <span className="text-sm text-muted-foreground">{description}</span>
          </div>
          <div className="my-auto shrink-0">{renderAction()}</div>
        </div>
        <ConnectStatusMessage status={status} />
      </div>
    </StepShell>
  );
}
