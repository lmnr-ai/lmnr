import { User } from "lucide-react";
import Link from "next/link";

import { userSessionsUrl, userTracesUrl } from "@/components/traces/trace-view/header/user-traces-url";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectContext } from "@/contexts/project-context";
import { formatRelativeTime, formatTimestamp } from "@/lib/utils";

import Stat from "./stat";
import { useUserStats } from "./use-user-stats";

/** A user's lifetime activity: sessions, traces, first and last seen. */
export default function UserPreviewContent({ projectId, userId }: { projectId: string; userId: string }) {
  const { project } = useProjectContext();
  const result = useUserStats(projectId, userId);
  const retention = project?.logRetentionDays;

  return (
    <div className="flex w-72 flex-col text-xs">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <User className="size-3.5 shrink-0 text-muted-foreground" />
        <CopyTooltip value={userId} className="min-w-0 truncate font-mono">
          {userId}
        </CopyTooltip>
      </div>
      {result.status === "loading" ? (
        <div className="grid grid-cols-2 gap-3 p-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : result.status === "error" ? (
        <div className="p-3 text-muted-foreground">Couldn&apos;t load this user.</div>
      ) : !result.stats ? (
        <div className="p-3 text-muted-foreground">No traces for this user.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-3">
          <Stat label="Sessions" value={result.stats.sessionCount.toLocaleString()} />
          <Stat label="Traces" value={result.stats.traceCount.toLocaleString()} />
          <Stat
            label="First seen"
            value={formatRelativeTime(result.stats.firstSeen)}
            title={formatTimestamp(result.stats.firstSeen)}
          />
          <Stat
            label="Last seen"
            value={formatRelativeTime(result.stats.lastSeen)}
            title={formatTimestamp(result.stats.lastSeen)}
          />
        </div>
      )}
      <div className="flex gap-3 border-t px-3 py-2">
        <Link
          href={userSessionsUrl(projectId, userId, retention)}
          className="text-muted-foreground hover:text-foreground"
        >
          View sessions
        </Link>
        <Link
          href={userTracesUrl(projectId, userId, retention)}
          className="text-muted-foreground hover:text-foreground"
        >
          View traces
        </Link>
      </div>
    </div>
  );
}
