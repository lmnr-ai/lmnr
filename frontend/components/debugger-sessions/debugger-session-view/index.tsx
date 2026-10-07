"use client";

import { type ComponentProps, useEffect } from "react";

import Header from "@/components/ui/header";
import { track } from "@/lib/posthog";

import DebuggerSessionViewContent from "./debugger-session-view-content";
import DebuggerSessionViewStoreProvider, { useDebuggerSessionViewStore } from "./store";

interface DebuggerSessionViewProps {
  // Breadcrumb path; last segment is the session title.
  headerPath: ComponentProps<typeof Header>["path"];
  // Debugger session id — drives the trace fetch + realtime span streaming.
  sessionId: string;
  // The session's real name (null when never named). Seeds the editable title's
  // raw name so it can show a "Set session name" placeholder vs. the breadcrumb,
  // which falls back to the id.
  initialName?: string | null;
}

// Last breadcrumb segment is the session/trace title rendered in the header.
const titleFromPath = (path: ComponentProps<typeof Header>["path"]): string => {
  if (Array.isArray(path)) return path[path.length - 1]?.name ?? "Session";
  return path.split("/").pop() ?? "Session";
};

// Breadcrumb that tracks live renames: the store's `sessionName` (updated by the
// realtime `session_update` handler) replaces the last path segment's name. Must
// render inside the store provider.
function LiveSessionBreadcrumb({ path }: { path: ComponentProps<typeof Header>["path"] }) {
  const sessionName = useDebuggerSessionViewStore((s) => s.sessionName);
  const livePath = Array.isArray(path)
    ? path.map((segment, i) => (i === path.length - 1 ? { ...segment, name: sessionName } : segment))
    : path;
  return <Header path={livePath} />;
}

export default function DebuggerSessionView({ headerPath, sessionId, initialName }: DebuggerSessionViewProps) {
  useEffect(() => {
    track("debugger_sessions", "session_viewed");
  }, []);

  return (
    <DebuggerSessionViewStoreProvider
      key={sessionId}
      initialSessionName={titleFromPath(headerPath)}
      initialSessionNameRaw={initialName ?? null}
      sessionId={sessionId}
    >
      <LiveSessionBreadcrumb path={headerPath} />
      <div className="flex-none border-t" />
      <DebuggerSessionViewContent sessionId={sessionId} />
    </DebuggerSessionViewStoreProvider>
  );
}
