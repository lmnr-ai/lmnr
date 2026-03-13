"use client";

import { Clock, Hash, Loader2, Mail, X } from "lucide-react";
import { useState } from "react";

import { type SlackIntegrationInfo } from "@/components/slack/slack-connection-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type ReportTargetRow, type ReportWithDetails } from "@/lib/actions/reports/types";
import { type SlackChannel } from "@/lib/actions/slack";

import { formatSchedule } from "./utils";

interface ReportsListProps {
  reports: ReportWithDetails[];
  isLoading: boolean;
  email: string;
  togglingReportId: string | null;
  isEmailSubscribed: (report: ReportWithDetails) => boolean;
  slackTarget: (report: ReportWithDetails) => ReportTargetRow | undefined;
  slackIntegration: SlackIntegrationInfo | null;
  channels: SlackChannel[];
  onEmailToggle: (report: ReportWithDetails, subscribe: boolean) => void;
  onSlackSubscribe: (report: ReportWithDetails, channelId: string) => void;
  onSlackUnsubscribe: (report: ReportWithDetails) => void;
}

export default function ReportsList({
  reports,
  isLoading,
  email,
  togglingReportId,
  isEmailSubscribed,
  slackTarget,
  slackIntegration,
  channels,
  onEmailToggle,
  onSlackSubscribe,
  onSlackUnsubscribe,
}: ReportsListProps) {
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
        const emailSubscribed = isEmailSubscribed(report);
        const currentSlackTarget = slackTarget(report);
        const isToggling = togglingReportId === report.id;

        return (
          <ReportRow
            key={report.id}
            report={report}
            email={email}
            emailSubscribed={emailSubscribed}
            currentSlackTarget={currentSlackTarget}
            slackIntegration={slackIntegration}
            channels={channels}
            isToggling={isToggling}
            onEmailToggle={onEmailToggle}
            onSlackSubscribe={onSlackSubscribe}
            onSlackUnsubscribe={onSlackUnsubscribe}
          />
        );
      })}
    </div>
  );
}

interface ReportRowProps {
  report: ReportWithDetails;
  email: string;
  emailSubscribed: boolean;
  currentSlackTarget: ReportTargetRow | undefined;
  slackIntegration: SlackIntegrationInfo | null;
  channels: SlackChannel[];
  isToggling: boolean;
  onEmailToggle: (report: ReportWithDetails, subscribe: boolean) => void;
  onSlackSubscribe: (report: ReportWithDetails, channelId: string) => void;
  onSlackUnsubscribe: (report: ReportWithDetails) => void;
}

function ReportRow({
  report,
  email,
  emailSubscribed,
  currentSlackTarget,
  slackIntegration,
  channels,
  isToggling,
  onEmailToggle,
  onSlackSubscribe,
  onSlackUnsubscribe,
}: ReportRowProps) {
  const [selectedChannelId, setSelectedChannelId] = useState("");

  return (
    <div className="flex flex-col gap-3 px-4 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{report.label}</span>
          <Badge variant="outline" className="font-normal text-xs gap-1 text-secondary-foreground w-fit">
            <Clock className="size-3" />
            {formatSchedule(report.schedule)}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {/* Email subscription */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mail className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-secondary-foreground">{emailSubscribed ? email : "Email"}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isToggling && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            <Label
              htmlFor={`report-email-toggle-${report.id}`}
              className="text-xs text-secondary-foreground cursor-pointer"
            >
              {emailSubscribed ? "Subscribed" : "Subscribe"}
            </Label>
            <Switch
              id={`report-email-toggle-${report.id}`}
              checked={emailSubscribed}
              disabled={isToggling}
              onCheckedChange={(checked) => onEmailToggle(report, checked)}
            />
          </div>
        </div>

        {/* Slack subscription */}
        {slackIntegration && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Hash className="size-3.5 text-muted-foreground" />
              {currentSlackTarget ? (
                <span className="text-xs text-secondary-foreground">
                  #{currentSlackTarget.channelName || currentSlackTarget.channelId}
                </span>
              ) : (
                <Select
                  value={selectedChannelId}
                  onValueChange={(value) => {
                    setSelectedChannelId(value);
                    onSlackSubscribe(report, value);
                  }}
                  disabled={isToggling}
                >
                  <SelectTrigger className="h-7 text-xs w-48">
                    <SelectValue placeholder="Select Slack channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        #{ch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {currentSlackTarget && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isToggling}
                onClick={() => onSlackUnsubscribe(report)}
              >
                <X className="size-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
