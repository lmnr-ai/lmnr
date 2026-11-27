import { ArrowUpRight, Layers } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

import TurnList from "./turn-list";
import { useSessionTurns } from "./use-session-turns";

interface SessionPreviewContentProps {
  projectId: string;
  sessionId: string;
  currentTraceId?: string;
  onSelect: (traceId: string) => void;
}

/** Mini view of a session: every turn's input, scrolled to the current trace. */
export default function SessionPreviewContent({
  projectId,
  sessionId,
  currentTraceId,
  onSelect,
}: SessionPreviewContentProps) {
  const turns = useSessionTurns(projectId, sessionId);
  const traces = turns.status === "ready" ? turns.traces : [];
  const href = `/project/${projectId}/sessions/${sessionId.split("/").map(encodeURIComponent).join("/")}`;

  return (
    <div className="flex w-96 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <Layers className="size-3.5 shrink-0 text-muted-foreground" />
        {/* The trigger already shows the id. */}
        <span className="font-medium">Session</span>
        {turns.status === "ready" && (
          <span className="shrink-0 text-muted-foreground">
            {traces.length} {traces.length === 1 ? "trace" : "traces"}
          </span>
        )}
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex shrink-0 items-center gap-0.5 text-muted-foreground hover:text-foreground"
        >
          Open
          <ArrowUpRight className="size-3" />
        </a>
      </div>
      {turns.status === "loading" ? (
        <div className="flex flex-col gap-2 p-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : turns.status === "error" ? (
        <div className="p-3 text-xs text-muted-foreground">Couldn&apos;t load this session.</div>
      ) : (
        <TurnList traces={traces} currentTraceId={currentTraceId} onSelect={onSelect} />
      )}
    </div>
  );
}
