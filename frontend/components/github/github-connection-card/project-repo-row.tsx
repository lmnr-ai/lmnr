"use client";

import { Unlink } from "lucide-react";
import { useState } from "react";

import { useProjectGithubRepo } from "@/components/github/hooks";
import RepoPicker from "@/components/github/repo-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

interface ProjectRepoRowProps {
  projectId: string;
  openPicker: boolean;
  configureUrl?: string;
}

export default function ProjectRepoRow({ projectId, openPicker, configureUrl }: ProjectRepoRowProps) {
  const { toast } = useToast();
  const { data: repo, isLoading, mutate } = useProjectGithubRepo(projectId);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const handleUnlink = async () => {
    setIsUnlinking(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/github/repo`, { method: "DELETE" });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Failed to unlink repository" });
        return;
      }
      track("integrations", "github_repo_unlinked");
      await mutate(null, { revalidate: false });
    } catch {
      toast({ variant: "destructive", title: "Failed to unlink repository" });
    } finally {
      setIsUnlinking(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">This project&apos;s repository</p>
        {repo ? (
          <a
            href={`https://github.com/${repo.repoFullName}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Linked to {repo.repoFullName}
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">No repository linked yet.</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <RepoPicker
          projectId={projectId}
          linkedRepo={repo ?? null}
          onLinked={(linked) => mutate(linked, { revalidate: false })}
          defaultOpen={openPicker && !repo}
          configureUrl={configureUrl}
        />
        {repo && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Unlink repository"
            className="h-7 w-7 text-muted-foreground"
            onClick={handleUnlink}
            disabled={isUnlinking}
          >
            <Unlink size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
