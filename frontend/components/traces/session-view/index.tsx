"use client";

import React from "react";

import SessionViewContent from "./session-view-content";
import SessionViewStoreProvider from "./store";

interface SessionViewProps {
  projectId: string;
  sessionId: string;
}

/**
 * Full-page session view rendered by
 * `/project/[projectId]/sessions/[...sessionId]`.
 */
export function SessionView({ projectId, sessionId }: SessionViewProps) {
  return (
    <SessionViewStoreProvider key={sessionId} projectId={projectId} sessionId={sessionId}>
      <div className="w-full h-full flex flex-col">
        <SessionViewContent />
      </div>
    </SessionViewStoreProvider>
  );
}

export default SessionView;
