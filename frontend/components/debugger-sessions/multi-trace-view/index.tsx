"use client";

import { useEffect, useMemo, useState } from "react";

import DebuggerSessionView from "@/components/debugger-sessions/debugger-session-view";
import { type SeedTrace } from "@/components/debugger-sessions/debugger-session-view/store";
import Header from "@/components/ui/header";
import { track } from "@/lib/posthog";
import { type TraceRow } from "@/lib/traces/types";

interface MultiTraceViewProps {
  projectId: string;
  sessionId: string;
  sessionName: string;
}

// Cap how many runs we render for a session.
const MAX_RUNS = 12;

// Oldest first → newest run renders at the BOTTOM of the stacked view.
const sortOldestFirst = (items: TraceRow[]): string[] =>
  items
    .slice()
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map((t) => t.id);

/**
 * Fetch the real traces for this session, returned oldest-first (newest run
 * renders at the bottom of the stacked view). We still query the most recent
 * MAX_RUNS, then sort ascending for display. Sessions group their runs via the
 * `rollout.session_id` trace-metadata key; if none are grouped yet (e.g. a
 * freshly registered session) we fall back to the project's recent traces.
 */
async function fetchSessionTraceIds(projectId: string, sessionId: string, signal: AbortSignal): Promise<string[]> {
  const url = (extra?: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams();
    p.set("pageNumber", "0");
    p.set("pageSize", String(MAX_RUNS));
    extra?.(p);
    return `/api/projects/${projectId}/traces?${p.toString()}`;
  };

  const sessionRes = await fetch(
    url((p) =>
      p.append(
        "filter",
        JSON.stringify({ column: "metadata", operator: "eq", value: `rollout.session_id=${sessionId}` })
      )
    ),
    { signal }
  );
  if (sessionRes.ok) {
    const data = (await sessionRes.json()) as { items: TraceRow[] };
    const ids = sortOldestFirst(data.items ?? []);
    if (ids.length > 0) return ids;
  }

  // Fallback: most recent traces in the project.
  const recentRes = await fetch(url(), { signal });
  if (recentRes.ok) {
    const data = (await recentRes.json()) as { items: TraceRow[] };
    return sortOldestFirst(data.items ?? []);
  }
  return [];
}

/**
 * Debugger session view: the debugger session view IS the session view. Each real
 * run (trace) becomes a stacked block (run header + timeline + note).
 *
 * The run note is the agent-authored `rollout.note` trace metadata (written via
 * `lmnr-cli trace set-note`); the store reads it off each trace once it loads,
 * so we only need to seed the trace ids here.
 */
export default function MultiTraceView({ projectId, sessionId, sessionName }: MultiTraceViewProps) {
  // null = still loading; [] = loaded, none available.
  const [realTraceIds, setRealTraceIds] = useState<string[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const ids = await fetchSessionTraceIds(projectId, sessionId, controller.signal);
        setRealTraceIds(ids);
        track("debugger_sessions", "session_viewed", { traceCount: ids.length });
      } catch {
        if (!controller.signal.aborted) setRealTraceIds([]);
      }
    })();
    return () => controller.abort();
  }, [projectId, sessionId]);

  // Seed the trace ids; the store fills each run's note from trace metadata once
  // the trace loads. DebuggerSessionView captures seeds once at store creation, so
  // this is only consumed after realTraceIds has settled (the loading gate below).
  const seeds: SeedTrace[] = useMemo(() => (realTraceIds ?? []).map((traceId) => ({ traceId })), [realTraceIds]);

  const headerPath = [
    { name: "debugger", href: `/project/${projectId}/debugger-sessions` },
    { name: sessionName, copyValue: sessionId },
  ];

  // Hold the UTV mount until seeds are resolved — the store seeds itself once.
  if (realTraceIds === null) {
    return (
      <>
        <Header path={headerPath} />
        <div className="flex-none border-t" />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading session…</div>
      </>
    );
  }

  if (seeds.length === 0) {
    return (
      <>
        <Header path={headerPath} />
        <div className="flex-none border-t" />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No traces to display for this session yet.
        </div>
      </>
    );
  }

  return <DebuggerSessionView seeds={seeds} headerPath={headerPath} sessionId={sessionId} />;
}
