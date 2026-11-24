import { GitCommitHorizontal, GitPullRequest } from "lucide-react";

import { type AgentVersionSource } from "@/lib/actions/agents";
import { cn } from "@/lib/utils";

type Change = AgentVersionSource["changes"][number];

/** `#123` for a pull request, the short SHA (from its URL) for a commit. */
const changeLabel = (change: Change) =>
  change.number !== null ? `#${change.number}` : (change.url.split("/commit/")[1]?.slice(0, 7) ?? "commit");

/** A pull request or commit, on a branch curving off the version timeline. */
export default function VersionChangeLink({ change }: { change: Change }) {
  const isCommit = change.number === null;
  const Icon = isCommit ? GitCommitHorizontal : GitPullRequest;

  return (
    <div className="relative flex min-w-0 py-0.5 pl-2">
      {/* Starts on the timeline line: VersionCard's w-10 rail center plus its gap-3, less half the 1px line. */}
      <span
        aria-hidden
        className="absolute top-1/2 left-[calc(-2rem-0.5px)] h-1/2 w-[calc(2.25rem+0.5px)] rounded-tl-md border-t border-l border-border"
      />
      <a
        href={change.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 items-center gap-1.5 text-xs"
      >
        <Icon className="size-3 shrink-0 text-success-text" />
        <span className={cn("shrink-0 text-secondary-foreground group-hover:text-foreground", isCommit && "font-mono")}>
          {changeLabel(change)}
        </span>
        <span className="truncate text-muted-foreground group-hover:text-foreground group-hover:underline">
          {change.title}
        </span>
      </a>
    </div>
  );
}
