"use client";

import { CheckCircle2, Mail } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import useSWR from "swr";

import slackLogo from "@/assets/logo/slack.png";
import { useOnboardingContext } from "@/components/onboarding/context";
import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useUserContext } from "@/contexts/user-context";
import { getReportDescription, REPORT_TARGET_TYPE, type ReportWithDetails } from "@/lib/actions/reports/types";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";
import { swrFetcher } from "@/lib/utils";

const SLACK_SCOPES = ["chat:write", "chat:write.public", "channels:read", "groups:read", "mpim:read"];

interface NotificationsStepProps {
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
  onBack: () => void;
}

export default function NotificationsStep({ stepIndex, totalSteps, onAdvance, onBack }: NotificationsStepProps) {
  const { watch, setValue, formState } = useFormContext<OnboardingFormValues>();
  const { email } = useUserContext();
  const flags = useFeatureFlags();
  const { resources, slackClientId, slackRedirectUri } = useOnboardingContext();
  const { isSubmitting, saveNotifications } = useOnboardingActions();

  const slackConnected = watch("slackConnected");
  const subscribedReportIds = watch("subscribedReportIds");
  const subscribed = useMemo(() => new Set(subscribedReportIds), [subscribedReportIds]);

  const { data: reports, isLoading } = useSWR<ReportWithDetails[]>(
    resources.workspaceId ? `/api/workspaces/${resources.workspaceId}/reports` : null,
    swrFetcher
  );

  // Mirror the user's current EMAIL targets while they haven't toggled anything,
  // so fresh-create flow (form initialized before workspace existed) shows the
  // auto-subscribed defaults checked.
  useEffect(() => {
    if (!reports || formState.dirtyFields.subscribedReportIds) return;
    const fromDb = reports.filter((r) => r.targets.some((t) => t.type === REPORT_TARGET_TYPE.EMAIL)).map((r) => r.id);
    setValue("subscribedReportIds", fromDb, { shouldDirty: false });
  }, [reports, formState.dirtyFields.subscribedReportIds, setValue]);

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

  const toggleReport = (reportId: string, checked: boolean) => {
    const next = new Set(subscribed);
    if (checked) next.add(reportId);
    else next.delete(reportId);
    setValue("subscribedReportIds", Array.from(next), { shouldDirty: true });
  };

  const handleNext = async () => {
    if (await saveNotifications()) onAdvance();
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Stay in the loop"
      description="Laminar pings you when a signal catches an issue or a new pattern shows up, and emails a weekly recap of everything that happened."
      hint="Email digests only go to you - teammates can opt in from their own settings. Everything here can be changed anytime in workspace and project settings."
      onNext={handleNext}
      onBack={onBack}
      isSubmitting={isSubmitting}
    >
      <div className="rounded-lg border border-border bg-background">
        <div className="flex items-start gap-2 px-4 py-3 border-b border-border">
          <Mail className="h-5 w-5 2xl:h-6 2xl:w-6 text-muted-foreground" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm 2xl:text-base font-medium text-secondary-foreground">Email digests</span>
            <span className="text-xs 2xl:text-sm text-muted-foreground truncate">
              Weekly recaps sent to <span className="font-medium text-foreground">{email ?? "your email"}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-col">
          {isLoading || !reports ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 border-t border-border first:border-t-0">
                <Skeleton className="size-4 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex h-5 items-center gap-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-4 w-3/5" />
                </div>
              </div>
            ))
          ) : reports.length === 0 ? (
            <p className="px-4 py-3 text-xs 2xl:text-sm text-muted-foreground">
              No scheduled digests for this workspace yet.
            </p>
          ) : (
            reports.map((report) => {
              const checked = subscribed.has(report.id);
              const inputId = `report-${report.id}`;
              const description = getReportDescription(report.schedule);
              return (
                <label
                  key={report.id}
                  htmlFor={inputId}
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer border-t border-border first:border-t-0 hover:bg-muted/30"
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={(value) => toggleReport(report.id, value === true)}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm 2xl:text-base font-medium text-secondary-foreground">
                        {description.title}
                      </span>
                      <span className="text-xs 2xl:text-sm text-muted-foreground">{description.schedule}</span>
                    </div>
                    {description.detail && (
                      <span className="text-xs 2xl:text-sm text-muted-foreground">{description.detail}</span>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
        <Image src={slackLogo} alt="Slack" className="mt-0.5 shrink-0 h-6 w-6 2xl:h-7 2xl:w-7" unoptimized />
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-sm 2xl:text-base font-medium text-secondary-foreground">Slack alerts</span>
          <span className="text-xs 2xl:text-sm text-muted-foreground">
            {slackConnected
              ? "Connected. Pick channels later in workspace settings."
              : slackAvailable
                ? "Real-time pings when a signal catches an issue or a new pattern emerges. One click to authorize."
                : "Slack integration isn't configured in this environment."}
          </span>
        </div>
        <div className="my-auto shrink-0">
          {slackConnected ? (
            <Button className="border-success bg-success/80 gap-1 hover:bg-success/80">
              <CheckCircle2 className="h-4 w-4 2xl:h-5 2xl:w-5" />
              Connected
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
