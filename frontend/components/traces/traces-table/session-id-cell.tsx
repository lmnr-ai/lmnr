"use client";

import { useParams } from "next/navigation";

import SessionPreview from "@/components/traces/session-preview";
import Mono from "@/components/ui/mono";

/** Session ID with a hover preview of the session's turns, scrolled to this row's trace. */
export default function SessionIdCell({ sessionId, traceId }: { sessionId?: string; traceId: string }) {
  const { projectId } = useParams();
  if (!sessionId || sessionId === "<null>") return null;

  return (
    <SessionPreview projectId={String(projectId)} sessionId={sessionId} currentTraceId={traceId} side="right">
      <Mono className="block truncate text-xs">{sessionId}</Mono>
    </SessionPreview>
  );
}
