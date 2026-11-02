"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { useProjectGithubRepo } from "@/components/github/hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { type GithubRepoOption, type ProjectGithubRepo } from "@/lib/actions/github/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { swrFetcher } from "@/lib/utils";

import RepoListItem from "./repo-list-item";

interface RepoListProps {
  projectId: string;
  // GitHub page where the installation's repo access is changed.
  manageUrl: string;
}

export default function RepoList({ projectId, manageUrl }: RepoListProps) {
  const { toast } = useToast();
  const { data: repos, isLoading } = useSWR<GithubRepoOption[]>(`/api/projects/${projectId}/github/repos`, swrFetcher);
  const { data: linked, mutate: mutateLinked } = useProjectGithubRepo(projectId);
  const [pendingRepoId, setPendingRepoId] = useState<number | null>(null);

  const linkRepo = async (repoId: number) => {
    setPendingRepoId(repoId);
    try {
      const res = await fetch(`/api/projects/${projectId}/github/repo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId }),
      });
      if (!res.ok) {
        const error = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: error ?? "Failed to link the repository" });
        return;
      }
      const next: ProjectGithubRepo = await res.json();
      track("integrations", "github_repo_linked");
      await mutateLinked(next, { revalidate: false });
    } catch {
      toast({ variant: "destructive", title: "Failed to link the repository" });
    } finally {
      setPendingRepoId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
      <div>
        <p className="text-sm font-medium">Link a repository to this project</p>
        <p className="text-xs text-muted-foreground">Laminar&apos;s agent opens pull requests in this repository.</p>
      </div>
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : repos?.length ? (
        <ScrollArea className="-mx-2 max-h-48" viewportClassName="max-h-48 [&>div]:!block [&>div]:!w-full">
          <div role="radiogroup" className="flex flex-col pr-3">
            {repos.map((repo) => (
              <RepoListItem
                key={repo.id}
                repo={repo}
                linked={linked?.repoId === repo.id}
                pending={pendingRepoId === repo.id}
                disabled={pendingRepoId !== null}
                onSelect={() => linkRepo(repo.id)}
              />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className="text-xs text-muted-foreground">The Laminar app can&apos;t access any repositories yet.</p>
      )}
      <a
        href={manageUrl}
        target="_blank"
        rel="noreferrer"
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Manage access on GitHub
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
