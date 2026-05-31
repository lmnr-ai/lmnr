"use client";

import { DatabaseZap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { parseCacheBoundary } from "@/components/debugger-sessions/debugger-session-view/cache-boundary";
import { useDebuggerSessionStore } from "@/components/debugger-sessions/debugger-session-view/store";
import Mono from "@/components/ui/mono";

const SessionInfo = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const trace = useDebuggerSessionStore((state) => state.trace);

  const boundary = useMemo(() => parseCacheBoundary(trace?.metadata), [trace?.metadata]);

  if (!boundary) return null;

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3">
      <div className="flex items-center gap-1.5">
        <DatabaseZap className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold text-secondary-foreground">Replay cache</h4>
      </div>

      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Source trace</span>
          <Link
            href={`/project/${projectId}/traces/${boundary.replayTraceId}`}
            className="text-primary hover:underline truncate"
            title={boundary.replayTraceId ?? undefined}
          >
            <Mono className="text-xs">{boundary.replayTraceId?.slice(0, 8)}…</Mono>
          </Link>
        </div>

        {boundary.cacheUntil !== null && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Cached steps (N)</span>
            <span className="font-medium">{boundary.cacheUntil}</span>
          </div>
        )}

        {boundary.spinePath && (
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">Spine path</span>
            <span className="truncate" title={boundary.spinePath}>
              <Mono className="text-xs">{boundary.spinePath}</Mono>
            </span>
          </div>
        )}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Caches the main agent&apos;s LLM steps up to N; tool and subagent work re-runs.
      </p>
    </div>
  );
};

export default SessionInfo;
