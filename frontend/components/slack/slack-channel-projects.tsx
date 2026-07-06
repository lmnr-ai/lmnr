"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SlackChannel } from "@/lib/actions/slack";
import type { SlackChannelProjectBinding } from "@/lib/actions/slack/channel-projects";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
}

interface SlackChannelProjectsProps {
  workspaceId: string;
  className?: string;
}

// Lets an admin route an inbound Slack @mention in a channel to a specific Laminar project's agent.
// Only rendered once Slack is connected (the channel list needs the bot token).
export default function SlackChannelProjects({ workspaceId, className }: SlackChannelProjectsProps) {
  const { data: integration } = useSlackIntegration(workspaceId);
  const { toast } = useToast();

  const {
    data: bindings,
    isLoading: bindingsLoading,
    mutate,
  } = useSWR<SlackChannelProjectBinding[]>(
    integration ? `/api/workspaces/${workspaceId}/slack/channel-projects` : null,
    swrFetcher
  );
  const { data: channelsResult, isLoading: channelsLoading } = useSWR<{ channels: SlackChannel[] }>(
    integration ? `/api/workspaces/${workspaceId}/slack/channels` : null,
    swrFetcher
  );
  const { data: projects } = useSWR<Project[]>(
    integration ? `/api/workspaces/${workspaceId}/projects` : null,
    swrFetcher
  );

  const [channelId, setChannelId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const channels = channelsResult?.channels ?? [];
  const channelName = useMemo(() => channels.find((c) => c.id === channelId)?.name, [channels, channelId]);
  // Channels already bound — keep the picker to channels without a binding to avoid silent overwrites.
  const boundChannelIds = useMemo(() => new Set((bindings ?? []).map((b) => b.channelId)), [bindings]);
  const availableChannels = channels.filter((c) => !boundChannelIds.has(c.id));

  if (!integration) return null;

  const handleAdd = async () => {
    if (!channelId || !projectId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/slack/channel-projects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, channelName, projectId }),
      });
      if (!res.ok) {
        const data = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        throw new Error(data ?? "Failed to connect channel");
      }
      track("integrations", "slack_channel_bound");
      setChannelId("");
      setProjectId("");
      await mutate();
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (binding: SlackChannelProjectBinding) => {
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/slack/channel-projects?channelId=${encodeURIComponent(binding.channelId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        throw new Error(data ?? "Failed to remove binding");
      }
      await mutate();
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  return (
    <div className={cn("rounded-lg border border-border px-4 py-4 flex flex-col gap-4", className)}>
      <div>
        <p className="text-sm font-medium">Connect your Slack channels to projects</p>
        <p className="text-xs text-muted-foreground">
          Mentioning @Laminar in a connected channel will answer questions about the connected project.
        </p>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-xs text-muted-foreground">Channel</Label>
          <Select value={channelId} onValueChange={setChannelId} disabled={channelsLoading}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder={channelsLoading ? "Loading channels…" : "Select a channel"} />
            </SelectTrigger>
            <SelectContent>
              {availableChannels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  #{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-xs text-muted-foreground">Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAdd} disabled={!channelId || !projectId || saving} className="h-8">
          {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
          Connect
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-7 px-2 text-xs font-normal">Channel</TableHead>
            <TableHead className="h-7 px-2 text-xs font-normal">Project</TableHead>
            <TableHead className="h-7 w-9 px-2" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {bindingsLoading ? (
            <TableRow>
              <TableCell className="px-2 py-1.5">
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell className="px-2 py-1.5">
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell className="px-2 py-1.5" />
            </TableRow>
          ) : bindings && bindings.length > 0 ? (
            bindings.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="px-2 py-1 font-mono text-xs">#{b.channelName ?? b.channelId}</TableCell>
                <TableCell className="px-2 py-1 truncate text-xs">{b.projectName ?? b.projectId}</TableCell>
                <TableCell className="px-2 py-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(b)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={3} className="px-2 py-2 text-center text-xs text-muted-foreground">
                No channels connected yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
