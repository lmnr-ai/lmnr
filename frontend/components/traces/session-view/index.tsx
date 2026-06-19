"use client";

import React from "react";

import SessionViewContent from "./session-view-content";
import SessionViewStoreProvider, { type SessionSummary } from "./store";

interface SessionViewProps {
  sessionId: string;
  initialSession?: SessionSummary;
}

/**
 * Full-page session view rendered by
 * `/project/[projectId]/sessions/[...sessionId]`.
 */
export function SessionView({ sessionId, initialSession }: SessionViewProps) {
  return (
    <SessionViewStoreProvider key={sessionId} initialSession={initialSession ?? { sessionId }}>
      <div className="w-full h-full flex flex-col">
        <SessionViewContent sessionId={sessionId} />
      </div>
    </SessionViewStoreProvider>
  );
}

export default SessionView;
