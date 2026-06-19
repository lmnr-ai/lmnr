"use client";

import { Clock, Loader2, Mail } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import SlackChannelPicker, { type SlackChannelSelection } from "@/components/settings/alerts/slack-channel-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { REPORT_TARGET_TYPE, type ReportWithDetails } from "@/lib/actions/reports/types";
import { type SlackChannel } from "@/lib/actions/slack";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

import { formatSchedule } from "./utils";

interface ManageReportSheetProps {
  workspaceId: string;
  integrationId?: string | null;
  report: ReportWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  userEmail: string;
}

export default function ManageReportSheet({
  workspaceId,
  integrationId,
  report,
  open,
  onOpenChange,
  onSaved,
  userEmail,
}: ManageReportSheetProps) {
  const hasSlackIntegration = !!integrationId;
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);

  // Derive current state from report targets
  const currentEmailSubscribed = useMemo(
    () => report?.targets.some((t) => t.type === REPORT_TARGET_TYPE.EMAIL && t.email === userEmail) ?? false,
    [report, userEmail]
  );

  const currentSlackChannels = useMemo<SlackChannelSelection[]>(
    () =>
      (report?.targets ?? [])
        .filter((t) => t.type === REPORT_TARGET_TYPE.SLACK && t.channelId && t.channelName)
        .map((t) => ({ id: t.channelId!, name: t.channelName! })),
    [report]
  );

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [slackChannels, setSlackChannels] = useState<SlackChannelSelection[]>([]);

  useEffect(() => {
    if (!open || !report) return;
    setEmailEnabled(currentEmailSubscribed);
    setSlackChannels(currentSlackChannels);
  }, [open, report, currentEmailSubscribed, currentSlackChannels]);

  const { data: channelsResult, isLoading: isLoadingChannels } = useSWR<{
    channels: SlackChannel[];
    rateLimited: boolean;
  }>(open && hasSlackIntegration ? `/api/workspaces/${workspaceId}/slack/channels` : null, swrFetcher);
  const channels = channelsResult?.channels;

  useEffect(() => {
    if (channelsResult?.rateLimited) {
      toast({
        title: "Slack channel list may be incomplete",
        description: "Slack rate-limited the request. Some channels may not appear in the picker.",
      });
    }
  }, [channelsResult, toast]);

  const slackChanged = useMemo(() => {
    if (slackChannels.length !== currentSlackChannels.length) return true;
    const current = new Set(currentSlackChannels.map((c) => c.id));
    return slackChannels.some((c) => !current.has(c.id));
  }, [slackChannels, currentSlackChannels]);

  const hasChanges = useMemo(() => {
    if (!report) return false;
    return emailEnabled !== currentEmailSubscribed || slackChanged;
  }, [report, emailEnabled, currentEmailSubscribed, slackChanged]);

  const handleSave = useCallback(async () => {
    if (!report) return;
    setIsSaving(true);

    let anyChangeCommitted = false;
    try {
      const emailChanged = emailEnabled !== currentEmailSubscribed;

      if (emailChanged) {
        const res = await fetch(`/api/workspaces/${workspaceId}/reports`, {
          method: emailEnabled ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: report.id, email: userEmail }),
        });
        if (!res.ok) {
          const error = (await res.json().catch(() => ({ error: "Failed to update email subscription" }))) as {
            error: string;
          };
          throw new Error(error?.error ?? "Failed to update email subscription");
        }
        anyChangeCommitted = true;
      }

      if (slackChanged && hasSlackIntegration && integrationId) {
        const res = await fetch(`/api/workspaces/${workspaceId}/reports/slack-target`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId: report.id,
            integrationId,
            channels: slackChannels,
          }),
        });
        if (!res.ok) {
          const error = (await res.json().catch(() => ({ error: "Failed to set Slack channels" }))) as {
            error: string;
          };
          throw new Error(error?.error ?? "Failed to set Slack channels");
        }
        anyChangeCommitted = true;
      }

      toast({
        title: "Report updated",
        description: "Notification targets have been updated.",
      });
      track("reports", "edited", {
        has_slack: slackChannels.length > 0,
        slack_channel_count: slackChannels.length,
        has_email: emailEnabled,
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      // Refresh cache if any change was committed before the failure,
      // so the UI reflects the actual state in the database.
      if (anyChangeCommitted) onSaved();
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update report. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    report,
    emailEnabled,
    currentEmailSubscribed,
    slackChannels,
    slackChanged,
    hasSlackIntegration,
    integrationId,
    workspaceId,
    userEmail,
    onSaved,
    onOpenChange,
    toast,
  ]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
      }}
    >
      <SheetContent side="right" className="min-w-[50vw] w-full flex flex-col gap-0 focus:outline-none">
        <SheetHeader className="py-4 px-4 border-b">
          <SheetTitle>Edit report</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 p-4">
            {report && (
              <>
                <div className="grid gap-2">
                  <Label>Report</Label>
                  <p className="text-sm">{report.label}</p>
                  <Badge variant="outline" className="font-normal text-xs gap-1 text-secondary-foreground w-fit">
                    <Clock className="size-3" />
                    {formatSchedule(report.schedule)}
                  </Badge>
                </div>

                <div className="grid gap-4">
                  <Label>Notification targets</Label>
                  <p className="text-xs text-muted-foreground -mt-3">Choose where to send report notifications.</p>

                  {hasSlackIntegration && (
                    <div className="grid gap-2">
                      <Label className="text-xs font-normal text-muted-foreground">Slack channels</Label>
                      <SlackChannelPicker
                        channels={channels}
                        isLoading={isLoadingChannels}
                        value={slackChannels}
                        onChange={setSlackChannels}
                        placeholder="Search for channels..."
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Mail className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Email</p>
                        <p className="text-xs text-muted-foreground">{userEmail}</p>
                      </div>
                    </div>
                    <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
        <div className="flex justify-end px-4 py-3 border-t">
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            <Loader2 className={cn("mr-2 hidden", { "animate-spin block": isSaving })} size={16} />
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
