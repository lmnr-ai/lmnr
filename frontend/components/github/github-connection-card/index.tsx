"use client";

import { useState } from "react";

import ConnectStatusMessage from "@/components/github/connect-status-message";
import { githubInstallHref, useGithubConnectStatus, useGithubIntegration } from "@/components/github/hooks";
import RepoList from "@/components/github/repo-list";
import { Button } from "@/components/ui/button";
import { IconGitHub } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { track } from "@/lib/posthog";

import CardMenu from "./card-menu";
import DisconnectDialog from "./disconnect-dialog";

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
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
    );
  }

  const subtitle = integration
    ? integration.accountLogin
    : canManage
      ? "Laminar's agent reads your code with AI model providers and opens pull requests."
      : "Ask a workspace owner or admin to connect GitHub.";

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-300">
      <div className="flex items-center gap-4 p-4">
        <IconGitHub className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">GitHub</p>
          <p className="text-xs text-muted-foreground">
            {subtitle}
            {integration?.suspended && <span className="text-destructive-text"> · Suspended on GitHub</span>}
          </p>
          <ConnectStatusMessage status={status} className="mt-1" />
        </div>
        {canManage &&
          (integration ? (
            <CardMenu onDisconnect={() => setDisconnectOpen(true)} />
          ) : (
            <Button asChild variant="outlinePrimary">
              <a
                href={githubInstallHref(projectId, returnTo)}
                onClick={() => track("integrations", "github_connect_clicked")}
              >
                Connect to GitHub
              </a>
            </Button>
          ))}
      </div>
      {integration && <RepoList projectId={projectId} manageUrl={integration.manageUrl} />}
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
