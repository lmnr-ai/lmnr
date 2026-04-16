"use client";

import { EllipsisVertical, Loader2, Trash2 } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import slackLogo from "@/assets/logo/slack.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { track } from "@/lib/analytics";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import SlackConnectButton from "./slack-connect-button";

export interface SlackIntegrationInfo {
  id: string;
  teamName: string | null;
  createdAt?: string;
}

interface SlackConnectionCardProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
  returnPath?: string;
  disabled?: boolean;
}

export function useSlackIntegration(workspaceId: string, enabled = true) {
  return useSWR<SlackIntegrationInfo | null>(enabled ? `/api/workspaces/${workspaceId}/slack` : null, swrFetcher);
}

export default function SlackConnectionCard({
  workspaceId,
  slackClientId,
  slackRedirectUri,
  returnPath,
  disabled,
}: SlackConnectionCardProps) {
  const searchParams = useSearchParams();
  const { data: slackIntegration, isLoading, mutate } = useSlackIntegration(workspaceId, !disabled);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const { toast } = useToast();

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/slack`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to remove integration");
      }
      await mutate(null);
      track("integrations", "slack_disconnected");
      toast({
        title: "Slack integration removed",
        description: "You will no longer receive Slack notifications from this workspace.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to remove Slack integration. Please try again.",
      });
    } finally {
      setIsRemoving(false);
      setConfirmOpen(false);
    }
  };

  if (disabled) return null;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-md shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
    );
  }

  const slackError = searchParams.get("slack") === "error";

  return (
    <>
      <div className="rounded-lg border border-border p-4 flex items-center gap-4">
        <Image src={slackLogo} alt="Slack" width={32} height={32} className="shrink-0" unoptimized />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Slack</p>
          <p className="text-xs text-muted-foreground">
            {slackIntegration
              ? "Receive notifications in Slack. Works across all projects."
              : "Connect your workspace to Slack to receive notifications."}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {slackIntegration ? (
            <>
              <Badge className="py-1.5 border-success bg-success/80" variant="outline">
                Connected
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                    <EllipsisVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel className="text-xs font-normal p-1 text-secondary-foreground">
                    Workspace: <span className="text-foreground">{slackIntegration.teamName ?? "-"}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-1 text-destructive focus:text-destructive"
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    <span>Remove</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <SlackConnectButton
              workspaceId={workspaceId}
              slackClientId={slackClientId}
              slackRedirectUri={slackRedirectUri}
              returnPath={returnPath}
            />
          )}
        </div>
        {slackError && <span className="text-destructive text-xs">Failed to connect. Please try again.</span>}
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Slack integration</DialogTitle>
            <DialogDescription>
              All notification subscriptions connected to this Slack workspace will be removed. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isRemoving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
              {isRemoving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
