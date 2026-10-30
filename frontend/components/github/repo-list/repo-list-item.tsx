import { Loader2 } from "lucide-react";

import { type GithubRepoOption } from "@/lib/actions/github/types";
import { cn } from "@/lib/utils";

interface RepoListItemProps {
  repo: GithubRepoOption;
  linked: boolean;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export default function RepoListItem({ repo, linked, pending, disabled, onSelect }: RepoListItemProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={linked}
      onClick={onSelect}
      disabled={disabled || linked}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:cursor-default",
        !linked && "hover:overlay-hover"
      )}
    >
      <span className={cn("min-w-0 truncate", linked ? "font-semibold text-foreground" : "text-muted-foreground")}>
        {repo.fullName}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
        {repo.private ? "Private" : "Public"}
        {pending && <Loader2 className="size-3.5 animate-spin" />}
      </span>
    </button>
  );
}
