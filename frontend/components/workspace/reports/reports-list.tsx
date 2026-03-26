"use client";

import { Clock, Hash, Loader2, Mail, X } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type ReportTargetRow, type ReportWithDetails } from "@/lib/actions/reports/types";
import { type SlackChannel } from "@/lib/actions/slack";
import { cn, swrFetcher } from "@/lib/utils";

import { formatSchedule } from "./utils";

interface ReportsListProps {
  reports: ReportWithDetails[];
  isLoading: boolean;
  email: string;
  workspaceId: string;
  togglingReportId: string | null;
  isSubscribed: (report: ReportWithDetails) => boolean;
  getSlackTarget: (report: ReportWithDetails) => ReportTargetRow | null;
  hasSlackIntegration: boolean;
  onToggle: (report: ReportWithDetails, subscribe: boolean) => void;
  onSlackChannelChange: (report: ReportWithDetails, channelId: string | null, channelName: string) => void;
}

export default function ReportsList({
  reports,
  isLoading,
  email,
  workspaceId,
  togglingReportId,
  isSubscribed,
  getSlackTarget,
  hasSlackIntegration,
  onToggle,
  onSlackChannelChange,
}: ReportsListProps) {
  const { data: channels } = useSWR<SlackChannel[]>(
    hasSlackIntegration ? `/api/workspaces/${workspaceId}/slack/channels` : null,
    swrFetcher
  );

  if (isLoading) {
    return (
      <div className="border rounded-md">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="border rounded-md">
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="text-sm text-muted-foreground">No reports available yet.</p>
          <p className="text-xs text-muted-foreground">
            Reports will appear here once they are configured for your workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-md divide-y">
      {reports.map((report) => {
        const subscribed = isSubscribed(report);
        const slackTarget = getSlackTarget(report);
        const isToggling = togglingReportId === report.id;

        return (
          <div key={report.id} className="flex flex-col gap-3 px-4 py-3 transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{report.label}</span>
                <Badge variant="outline" className="font-normal text-xs gap-1 text-secondary-foreground w-fit">
                  <Clock className="size-3" />
                  {formatSchedule(report.schedule)}
                </Badge>
              </div>
              {isToggling && <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />}
            </div>

            <div className="flex flex-col gap-2">
              <div
                className={cn(
                  "flex items-center justify-between rounded-md border p-3",
                  subscribed && "bg-secondary/30"
                )}
              >
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-xs text-muted-foreground">{email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label
                    htmlFor={`report-email-${report.id}`}
                    className="text-xs text-secondary-foreground cursor-pointer"
                  >
                    {subscribed ? "Subscribed" : "Subscribe"}
                  </Label>
                  <Switch
                    id={`report-email-${report.id}`}
                    checked={subscribed}
                    disabled={isToggling}
                    onCheckedChange={(checked) => onToggle(report, checked)}
                  />
                </div>
              </div>

              {hasSlackIntegration && (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-md border p-3",
                    slackTarget && "bg-secondary/30"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Hash className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Slack</p>
                      {slackTarget ? (
                        <p className="text-xs text-muted-foreground truncate">
                          #{slackTarget.channelName ?? slackTarget.channelId}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not configured</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {slackTarget ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        disabled={isToggling}
                        onClick={() => onSlackChannelChange(report, null, "")}
                      >
                        <X className="size-3 mr-1" />
                        Remove
                      </Button>
                    ) : (
                      <Select
                        value=""
                        onValueChange={(channelId) => {
                          const channel = channels?.find((ch) => ch.id === channelId);
                          if (channel) {
                            onSlackChannelChange(report, channel.id, channel.name);
                          }
                        }}
                        disabled={isToggling}
                      >
                        <SelectTrigger className="h-7 w-[180px] text-xs">
                          <SelectValue placeholder="Select channel" />
                        </SelectTrigger>
                        <SelectContent>
                          {channels?.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id}>
                              #{ch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
