"use client";

import React, { useRef } from "react";

import { cn } from "@/lib/utils";

import SessionViewContent from "./session-view-content";
import SessionViewStoreProvider, { type SessionSummary } from "./store";

interface SessionViewSidePanelProps {
  sessionId: string;
  onClose: () => void;
  initialSession?: SessionSummary;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Side-panel shell for the session view. Mirrors `TraceViewSidePanel` — an
 * absolute-positioned overlay that adopts a dynamic 3-panel layout
 * (Session / Span / Chat).
 *
 * The current implementation only ships the dynamic-width variant. Should we
 * ever need a full-page variant, add a `SessionView` export here that composes
 * a `FillWidthLayout` equivalent (see trace-view for the pattern).
 */
export function SessionViewSidePanel({
  sessionId,
  onClose,
  initialSession,
  className,
  children,
}: SessionViewSidePanelProps) {
  const sidePanelRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={sidePanelRef}
      className={cn(
        "absolute top-0 right-0 bottom-0 max-w-[calc(100%-80px)] bg-background border-l z-50 flex",
        className
      )}
    >
      <SessionViewStoreProvider key={sessionId} initialSession={initialSession ?? { sessionId }}>
        <div className="w-full h-full flex flex-col">
          {children}
          <SessionViewContent sessionId={sessionId} onClose={onClose} sidePanelRef={sidePanelRef} />
        </div>
      </SessionViewStoreProvider>
    </div>
  );
}

export default SessionViewSidePanel;
