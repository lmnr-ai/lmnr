"use client";

import { EllipsisVertical, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";

import ConnectStatusMessage from "@/components/github/connect-status-message";
import {
  githubInstallationSettingsUrl,
  githubInstallHref,
  useGithubConnectStatus,
  useGithubIntegration,
} from "@/components/github/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconGitHub } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { track } from "@/lib/posthog";

import DisconnectDialog from "./disconnect-dialog";
import ProjectRepoRow from "./project-repo-row";

interface GithubConnectionCardProps {
  workspaceId: string;
  projectId: string;
  // Owners and admins connect and disconnect; any member links a repo.
  canManage: boolean;
  returnTo: string;
}

export default function GithubConnectionCard({
  workspaceId,
  projectId,
  canManage,
  returnTo,
}: GithubConnectionCardProps) {
  const { data: integration, isLoading, mutate } = useGithubIntegration(workspaceId);
  const [status] = useGithubConnectStatus();
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  if (isLoading) {
    return <Skeleton className="h-[74px] w-full rounded-lg" />;
  }

  const configureUrl = integration && canManage ? githubInstallationSettingsUrl(integration) : undefined;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-300">
      <div className="flex items-center gap-4 p-4">
        <IconGitHub className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">GitHub</p>
          <p className="text-xs text-muted-foreground">
            {integration
              ? `Connected to ${integration.accountLogin}. Laminar's agent can open pull requests in linked repositories.`
              : "Let Laminar's agent read your code and open pull requests. It reads your code with AI model providers to make changes."}
          </p>
          <ConnectStatusMessage status={status} className="mt-1" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {integration ? (
            <>
              {integration.suspended ? (
                <Badge variant="outline" className="py-1.5">
                  Suspended on GitHub
                </Badge>
              ) : (
                <Badge className="border-success-border bg-success/80 py-1.5" variant="outline">
                  Connected
                </Badge>
              )}
              {configureUrl && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label="More options"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                    >
                      <EllipsisVertical size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem asChild>
                      <a href={configureUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Manage on GitHub
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setDisconnectOpen(true)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          ) : canManage ? (
            <Button asChild variant="outlinePrimary">
              <a
                href={githubInstallHref(projectId, returnTo)}
                onClick={() => track("integrations", "github_connect_clicked")}
              >
                Connect GitHub
              </a>
            </Button>
          ) : (
            <p className="max-w-48 text-right text-xs text-muted-foreground">
              Ask a workspace owner or admin to connect GitHub.
            </p>
          )}
        </div>
      </div>
      {integration && (
        <div className="border-t border-border p-4">
          <ProjectRepoRow projectId={projectId} openPicker={status === "connected"} configureUrl={configureUrl} />
        </div>
      )}
      {integration && (
        <DisconnectDialog
          workspaceId={workspaceId}
          accountLogin={integration.accountLogin}
          open={disconnectOpen}
          onOpenChange={setDisconnectOpen}
          onDisconnected={() => mutate(null, { revalidate: false })}
        />
      )}
    </div>
  );
}
