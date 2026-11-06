"use client";

import SessionViewStoreProvider from "@/components/traces/session-view/store";

import ChatSessionContent from "./content";
import { LiveSessionProvider } from "./live-session";

/**
 * Chat-style session view: the session reads as a messaging thread; clicking a
 * turn's "Worked" row (or a timeline span) opens the standard trace view beside it.
 */
export function ChatSessionView({ sessionId }: { sessionId: string }) {
  return (
    <SessionViewStoreProvider key={sessionId} initialSession={{ sessionId }} storeKey="chat-session-view-state">
      <LiveSessionProvider sessionId={sessionId}>
        <ChatSessionContent />
      </LiveSessionProvider>
    </SessionViewStoreProvider>
  );
}
