"use client";

import { type ReactNode } from "react";

import HoverPreview from "@/components/traces/hover-preview";

import SessionPreviewContent from "./content";
import { useSelectSessionTrace } from "./select-trace-context";

interface SessionPreviewProps {
  projectId: string;
  sessionId: string;
  /** Highlighted and scrolled into view in the list. */
  currentTraceId?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}

/** Hovering `children` shows a mini view of the session's turns; clicking one opens it. */
export default function SessionPreview({ projectId, sessionId, currentTraceId, side, children }: SessionPreviewProps) {
  const selectTrace = useSelectSessionTrace(projectId);

  return (
    <HoverPreview
      side={side}
      content={(close) => (
        <SessionPreviewContent
          projectId={projectId}
          sessionId={sessionId}
          currentTraceId={currentTraceId}
          onSelect={(traceId) => {
            close();
            selectTrace(traceId);
          }}
        />
      )}
    >
      {children}
    </HoverPreview>
  );
}
