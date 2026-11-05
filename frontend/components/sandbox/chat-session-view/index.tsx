"use client";

import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import SessionTimeline from "@/components/traces/session-view/session-timeline";
import SessionViewStoreProvider, { useSessionViewStore } from "@/components/traces/session-view/store";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import ChatSessionHeader from "./header";
import { useChatViewStore } from "./store";
import Thread from "./thread";
import TracePanel from "./trace-panel";
import { useSessionData } from "./use-session-data";

function ChatSessionContent({ sessionId }: { sessionId: string }) {
  useSessionData(sessionId);
  const { openSpan, reset } = useChatViewStore(useShallow((s) => ({ openSpan: s.openSpan, reset: s.reset })));
  const timelineEnabled = useSessionViewStore((s) => s.sessionTimelineEnabled);
  const timelineSelection = useSessionViewStore((s) => s.selectedSpan);

  useEffect(() => reset, [sessionId, reset]);

  // A span clicked in the session timeline opens its trace view on that span.
  useEffect(() => {
    if (timelineSelection) openSpan(timelineSelection.traceId, timelineSelection.spanId);
  }, [timelineSelection, openSpan]);

  const body = (
    <div className="flex h-full w-full overflow-hidden border-t">
      <div className="flex min-w-0 flex-1 flex-col">
        <Thread />
      </div>
      <TracePanel />
    </div>
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <ChatSessionHeader />
      {timelineEnabled ? (
        <ResizablePanelGroup id="chat-session-view-panels" orientation="vertical" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={120} minSize={80}>
            <div className="h-full border-t">
              <SessionTimeline />
            </div>
          </ResizablePanel>
          <ResizableHandle className="z-10 transition-colors hover:scale-200 hover:bg-blue-400" />
          <ResizablePanel className="flex min-h-0 min-w-0 flex-1 flex-col">{body}</ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="min-h-0 min-w-0 flex-1">{body}</div>
      )}
    </div>
  );
}

/**
 * v0 chat-style session view: the session reads as a messaging thread; clicking a
 * turn's "Worked" row (or a timeline span) opens the standard trace view beside it.
 */
export function ChatSessionView({ sessionId }: { sessionId: string }) {
  return (
    <SessionViewStoreProvider key={sessionId} initialSession={{ sessionId }} storeKey="chat-session-view-state">
      <ChatSessionContent sessionId={sessionId} />
    </SessionViewStoreProvider>
  );
}
