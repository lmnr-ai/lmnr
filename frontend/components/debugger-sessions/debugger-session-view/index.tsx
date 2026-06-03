"use client";

import { type ComponentProps } from "react";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import Header from "@/components/ui/header";

import DebugInfoPopover from "./debug-info-popover";
import DebuggerSessionViewContent from "./debugger-session-view-content";
import DebuggerSessionViewProvider from "./debugger-session-view-provider";
import { type SeedTrace } from "./store";
import TmpControlPanel from "./tmp-control-panel";

interface DebuggerSessionViewProps {
  // Single-trace harness (/alpha) passes a hydrated trace; multi-trace sessions pass seeds.
  trace?: TraceViewTrace;
  seeds?: SeedTrace[];
  // Breadcrumb path; when omitted falls back to the first trace.
  headerPath?: ComponentProps<typeof Header>["path"];
  // Debugger session id — enables realtime span streaming for the session's runs.
  sessionId?: string;
}

// Last breadcrumb segment is the session/trace title rendered in the header.
const titleFromPath = (path: ComponentProps<typeof Header>["path"]): string => {
  if (Array.isArray(path)) return path[path.length - 1]?.name ?? "Session";
  return path.split("/").pop() ?? "Session";
};

// Main exported component
export default function DebuggerSessionView({ trace, seeds, headerPath, sessionId }: DebuggerSessionViewProps) {
  const resolvedSeeds: SeedTrace[] = seeds && seeds.length > 0 ? seeds : trace ? [{ traceId: trace.id }] : [];
  const path = headerPath ?? (trace ? `traces/${trace.id}` : "traces");
  const sessionTitle = titleFromPath(path);

  return (
    <DebuggerSessionViewProvider seeds={resolvedSeeds} initialTrace={trace}>
      {/* TODO: remove — testing control panel for trace-render variants. */}
      <TmpControlPanel />
      <Header path={path}>
        <DebugInfoPopover />
      </Header>
      <div className="flex-none border-t" />
      <DebuggerSessionViewContent sessionId={sessionId} sessionTitle={sessionTitle} />
    </DebuggerSessionViewProvider>
  );
}
