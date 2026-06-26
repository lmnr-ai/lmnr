"use client";

import { EllipsisVertical, Loader2, RefreshCw, Settings, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectContext } from "@/contexts/project-context";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

import SlackConnectButton, { buildSlackConnectUrl } from "./slack-connect-button";

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
  brokerEnabled?: boolean;
  className?: string;
  // Rendered in the lower section of the same card (e.g. channel→project bindings). When omitted the
  // card is the standalone integration row used elsewhere (alerts / reports / signals).
  children?: ReactNode;
  // Hide the "Settings" link — used on the integration settings page itself (already there).
  hideSettingsLink?: boolean;
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
  brokerEnabled,
  className,
  children,
  hideSettingsLink,
}: SlackConnectionCardProps) {
  const searchParams = useSearchParams();
  const { settingsHref } = useProjectContext();
  const { data: slackIntegration, isLoading, mutate } = useSlackIntegration(workspaceId, !disabled);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const { toast } = useToast();

  // Re-running the OAuth flow upserts the bot token in place (merging newly-added scopes),
  // so an already-connected workspace can pick up new scopes without delete-then-reconnect.
  const reconnectUrl = useMemo(
    () => buildSlackConnectUrl({ workspaceId, slackClientId, slackRedirectUri, returnPath, brokerEnabled }),
    [workspaceId, slackClientId, slackRedirectUri, returnPath, brokerEnabled]
  );

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
      <div className={cn("rounded-lg border border-border p-4", className)}>
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

  const integrationRow = (
    <>
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
              <DropdownMenuContent align="end" className="w-48">
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Connected to the &quot;{slackIntegration.teamName ?? "Slack"}&quot; Slack workspace.
                </p>
                <div className="flex flex-col gap-1">
                  {!hideSettingsLink && (
                    <DropdownMenuItem asChild>
                      <Link href={settingsHref("integrations")}>
                        <Settings className="h-3.5 w-3.5" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {reconnectUrl && (
                    <DropdownMenuItem asChild>
                      <a href={reconnectUrl} onClick={() => track("integrations", "slack_reconnect_clicked")}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reconnect
                      </a>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <SlackConnectButton
            workspaceId={workspaceId}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
            returnPath={returnPath}
            brokerEnabled={brokerEnabled}
          />
        )}
      </div>
      {slackError && <span className="text-destructive text-xs">Failed to connect. Please try again.</span>}
    </>
  );

  return (
    <>
      {children ? (
        <div className={cn("flex flex-col rounded-lg border border-border bg-surface-800 overflow-hidden", className)}>
          <div className="flex items-center gap-4 p-4 bg-surface-700">{integrationRow}</div>
          {slackIntegration && <div className="border-t border-border">{children}</div>}
        </div>
      ) : (
        <div className={cn("rounded-lg border border-border p-4 flex items-center gap-4", className)}>
          {integrationRow}
        </div>
      )}
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
