"use client";

import { Loader2, Mail, Send } from "lucide-react";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { IconSlack } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import { type SlackChannel } from "@/lib/actions/slack";
import { fetchApi, swrFetcher } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";

import SlackChannelPicker from "../../slack-channel-picker";
import { type MetricAlertFormValues } from "./types";

interface NotifyStepProps {
  workspaceId: string;
  userEmail: string;
  /** Null when the workspace has no Slack connection. */
  integrationId?: string | null;
  /** False on plans without Slack delivery. */
  slackAvailable: boolean;
  /** One line that says what the rule watches, sent with the test message. */
  summary: string;
}

export default function NotifyStep({
  workspaceId,
  userEmail,
  integrationId,
  slackAvailable,
  summary,
}: NotifyStepProps) {
  const { toast } = useToast();
  const { control, watch } = useFormContext<MetricAlertFormValues>();
  const [name, slackChannels] = watch(["name", "slackChannels"]);
  const [isTesting, setIsTesting] = useState(false);
  const canPickChannels = slackAvailable && !!integrationId;

  const { data: channels, isLoading } = useSWR<{ channels: SlackChannel[] }>(
    canPickChannels ? `/api/workspaces/${workspaceId}/slack/channels` : null,
    swrFetcher
  );

  const sendTest = async () => {
    setIsTesting(true);
    const results = await Promise.all(
      slackChannels.map((channel) =>
        fetchApi(`/api/workspaces/${workspaceId}/slack/channels/${channel.id}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metricAlert: { name: name.trim() || "Metric alert", summary } }),
        })
      )
    );
    setIsTesting(false);
    const failed = results.find((result) => result.error !== null);
    if (failed) toast({ variant: "destructive", title: "Test not sent", description: failed.error });
    else toast({ title: "Test sent", description: "Check the selected Slack channels." });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y rounded-md border">
        <Controller
          name="emailEnabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Mail className="size-4 text-muted-foreground" />
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-xs text-muted-foreground">{userEmail}</p>
                </div>
              </div>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Email" />
            </div>
          )}
        />
        <div className="grid gap-2 p-3">
          <div className="flex items-center gap-3">
            <IconSlack className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm font-medium">Slack channels</p>
          </div>
          {canPickChannels ? (
            <Controller
              name="slackChannels"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2 pl-7">
                  <SlackChannelPicker
                    className="flex-1"
                    channels={channels?.channels}
                    isLoading={isLoading}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Search for channels..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-2"
                    disabled={field.value.length === 0 || isTesting}
                    onClick={sendTest}
                  >
                    {isTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    Send test
                  </Button>
                </div>
              )}
            />
          ) : (
            <p className="pl-7 text-xs text-muted-foreground">
              {slackAvailable
                ? "Connect Slack on the Alerts page to send alerts to a channel."
                : "Slack delivery is not included in the Free plan."}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Each incident is one Slack thread: a message when it opens, replies when it gets worse and when it resolves.
        Email is sent when an incident opens, gets worse or resolves. Every event also shows in the notification panel.
      </p>
    </div>
  );
}
