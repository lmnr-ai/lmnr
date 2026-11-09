"use client";

import { ChatSessionView } from "@/components/traces/chat-session-view";

const Session = ({ sessionId }: { sessionId: string }) => (
  <div className="flex min-h-0 flex-1 overflow-hidden">
    <ChatSessionView sessionId={sessionId} />
  </div>
);

export default Session;
