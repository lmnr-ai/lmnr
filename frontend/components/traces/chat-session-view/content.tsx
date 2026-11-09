"use client";

import { useCallback } from "react";

import { SessionPreviewSelectTraceProvider } from "@/components/traces/session-preview/select-trace-context";
import TimelineToggle from "@/components/traces/trace-view/header/timeline-toggle";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import ControlBar from "./control-bar";
import { useChatSession } from "./store";
import Thread from "./thread";
import SessionTimeline from "./timeline";
import TracePanel from "./trace-panel";
import { useOpenTrace } from "./use-open-trace";

export default function ChatSessionContent() {
  const { openTraceId, toggleTrace } = useOpenTrace();
  const timelineEnabled = useChatSession((s) => s.timelineEnabled);
  const setTimelineEnabled = useChatSession((s) => s.setTimelineEnabled);

  // Picking a turn in the trace header's session preview slides that turn's trace in.
  const selectTrace = useCallback(
    (traceId: string) => {
      if (openTraceId !== traceId) toggleTrace(traceId);
    },
    [openTraceId, toggleTrace]
  );

  return (
    <SessionPreviewSelectTraceProvider value={selectTrace}>
      <div className="flex h-full w-full min-w-0 overflow-hidden">
        {/* The timeline and control bar span only the thread column; the trace panel takes the full height beside it. */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Trace view's toggle: a pill in the control bar when closed, sliding up into the timeline's corner X tab. */}
          <TimelineToggle
            enabled={timelineEnabled}
            setEnabled={setTimelineEnabled}
            className={timelineEnabled ? "top-0" : "top-[7px]"}
          />
          <ResizablePanelGroup id="chat-session-view-panels" orientation="vertical" className="min-h-0 flex-1">
            {timelineEnabled && (
              <>
                <ResizablePanel defaultSize={120} minSize={80}>
                  <SessionTimeline />
                </ResizablePanel>
                <ResizableHandle className="z-10 transition-colors hover:scale-200 hover:bg-blue-400" />
              </>
            )}
            <ResizablePanel className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ControlBar />
              <Thread />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <TracePanel />
      </div>
    </SessionPreviewSelectTraceProvider>
  );
}
