"use client";

import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import SessionTimeline from "@/components/traces/session-view/session-timeline";
import SessionViewStoreProvider, { useSessionViewStore } from "@/components/traces/session-view/store";
import TimelineToggle from "@/components/traces/trace-view/header/timeline-toggle";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import ControlBar from "./control-bar";
import ChatSessionDial from "./dial";
import { useChatViewStore } from "./store";
import Thread from "./thread";
import TracePanel from "./trace-panel";
import { useSessionData } from "./use-session-data";

function ChatSessionContent({ sessionId }: { sessionId: string }) {
  useSessionData(sessionId);
  const { openSpan, reset } = useChatViewStore(useShallow((s) => ({ openSpan: s.openSpan, reset: s.reset })));
  const timelineEnabled = useSessionViewStore((s) => s.sessionTimelineEnabled);
  const setTimelineEnabled = useSessionViewStore((s) => s.setSessionTimelineEnabled);
  const timelineSelection = useSessionViewStore((s) => s.selectedSpan);

  useEffect(() => reset, [sessionId, reset]);

  // A span clicked in the session timeline opens its trace view on that span.
  useEffect(() => {
    if (timelineSelection) openSpan(timelineSelection.traceId, timelineSelection.spanId);
  }, [timelineSelection, openSpan]);

  // The timeline and control bar span only the thread column; the trace panel takes the full height beside it.
  const threadColumn = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ControlBar />
      <Thread />
    </div>
  );

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Trace view's toggle: a pill in the control bar when closed, sliding up into the timeline's corner X tab. */}
        <TimelineToggle
          enabled={timelineEnabled}
          setEnabled={setTimelineEnabled}
          className={timelineEnabled ? "top-0" : "top-[7px]"}
        />
        {timelineEnabled ? (
          <ResizablePanelGroup id="chat-session-view-panels" orientation="vertical" className="min-h-0 flex-1">
            <ResizablePanel defaultSize={120} minSize={80}>
              <SessionTimeline showCloseButton={false} />
            </ResizablePanel>
            <ResizableHandle className="z-10 transition-colors hover:scale-200 hover:bg-blue-400" />
            <ResizablePanel className="flex min-h-0 min-w-0 flex-1 flex-col">{threadColumn}</ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          threadColumn
        )}
      </div>
      <TracePanel />
    </div>
  );
}

/**
 * Chat-style session view: the session reads as a messaging thread; clicking a
 * turn's "Worked" row (or a timeline span) opens the standard trace view beside it.
 */
export function ChatSessionView({ sessionId }: { sessionId: string }) {
  return (
    <SessionViewStoreProvider key={sessionId} initialSession={{ sessionId }} storeKey="chat-session-view-state">
      <ChatSessionContent sessionId={sessionId} />
      <ChatSessionDial />
    </SessionViewStoreProvider>
  );
}
