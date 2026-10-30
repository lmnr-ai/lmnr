"use client";

import { ChevronsUpDown, ExternalLink, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type GithubRepoOption, type ProjectGithubRepo } from "@/lib/actions/github/types";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

interface RepoPickerProps {
  projectId: string;
  linkedRepo: ProjectGithubRepo | null;
  onLinked: (repo: ProjectGithubRepo) => void;
  defaultOpen?: boolean;
  // GitHub page where the installation's repo access is edited; shown to owners/admins.
  configureUrl?: string;
  className?: string;
}

export default function RepoPicker({
  projectId,
  linkedRepo,
  onLinked,
  defaultOpen = false,
  configureUrl,
  className,
}: RepoPickerProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [linking, setLinking] = useState(false);
  const debouncedQuery = useDebounce(query, 250);

  const { data: repos, isLoading } = useSWR<GithubRepoOption[]>(
    open ? `/api/projects/${projectId}/github/repos?${new URLSearchParams({ q: debouncedQuery })}` : null,
    swrFetcher,
    { keepPreviousData: true }
  );

  const linkRepo = async (repoId: number) => {
    setLinking(true);
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
        toast({ variant: "destructive", title: error ?? "Failed to link repository" });
        return;
      }
      const repo: ProjectGithubRepo = await res.json();
      track("integrations", "github_repo_linked");
      onLinked(repo);
      setOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to link repository" });
    } finally {
      setLinking(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between gap-2", className)}
        >
          <span className="truncate">{linkedRepo ? "Change repository" : "Connect a repo"}</span>
          {linking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" onWheel={(e) => e.stopPropagation()}>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search repositories" value={query} onValueChange={setQuery} className="h-9" />
          <CommandList>
            <CommandEmpty className="p-3 text-center text-sm text-secondary-foreground">
              {isLoading ? "Loading repositories..." : "No repositories found."}
            </CommandEmpty>
            <CommandGroup>
              {repos?.map((repo) => (
                <CommandItem
                  key={repo.id}
                  value={String(repo.id)}
                  disabled={linking}
                  onSelect={() => linkRepo(repo.id)}
                  className="gap-2"
                >
                  <span className="truncate">{repo.fullName}</span>
                  {repo.private && <Lock className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {configureUrl && (
            <a
              href={configureUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              Missing a repo? Change repository access on GitHub
            </a>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
