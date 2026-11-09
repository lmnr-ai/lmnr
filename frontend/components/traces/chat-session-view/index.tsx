"use client";

import ChatSessionContent from "./content";
import { SessionDataProvider } from "./data";
import { ChatSessionProvider } from "./store";

/**
 * Chat-style session view: the session reads as a messaging thread; clicking a
 * turn's "Worked" row (or a timeline span) opens the standard trace view beside it.
 */
export function ChatSessionView({ sessionId }: { sessionId: string }) {
  return (
    <ChatSessionProvider key={sessionId} sessionId={sessionId}>
      <SessionDataProvider sessionId={sessionId}>
        <ChatSessionContent />
      </SessionDataProvider>
    </ChatSessionProvider>
  );
}
