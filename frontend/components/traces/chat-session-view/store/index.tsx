"use client";

import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import { fetchApi } from "@/lib/api/fetch-api";

import { createLayoutSlice, type LayoutSlice } from "./layout";
import { createTimelineSlice, type TimelineDeps, type TimelineSlice } from "./timeline";

/** The chat session view's UI state: the session timeline and the trace panel layout. Data lives in SWR (`../data`). */
type ChatSessionState = TimelineSlice & LayoutSlice & { sessionId: string };

const createChatSessionStore = ({ sessionId, ...deps }: TimelineDeps & { sessionId: string }) =>
  createStore<ChatSessionState>()(
    // Remembers the timeline and trace panel preferences across visits.
    persist(
      (set, get) => ({
        sessionId,
        ...createTimelineSlice(deps)(set, get),
        ...createLayoutSlice(set, get),
      }),
      {
        name: "chat-session-view",
        partialize: (s) => ({
          timelineEnabled: s.timelineEnabled,
          timelineZoom: s.timelineZoom,
          traceWidth: s.traceWidth,
        }),
      }
    )
  );

const ChatSessionContext = createContext<StoreApi<ChatSessionState> | null>(null);

/** The session view's UI state: the timeline (and the spans it has loaded) and the trace panel layout. */
export function ChatSessionProvider({ sessionId, children }: PropsWithChildren<{ sessionId: string }>) {
  const { projectId } = useParams<{ projectId: string }>();
  const [store] = useState(() =>
    createChatSessionStore({
      sessionId,
      loadTraceSpans: async (trace) => {
        // Padded by a second: span times can sit just outside the trace's rounded bounds.
        const params = new URLSearchParams({
          startDate: new Date(Date.parse(trace.startTime) - 1000).toISOString(),
          endDate: new Date(Date.parse(trace.endTime) + 1000).toISOString(),
        });
        const { data, error } = await fetchApi<TraceViewSpan[]>(
          `/api/projects/${projectId}/traces/${trace.id}/spans?${params}`
        );
        return data ? { spans: enrichSpansWithPending(data) } : { error: error ?? "Failed to load spans" };
      },
    })
  );
  return <ChatSessionContext.Provider value={store}>{children}</ChatSessionContext.Provider>;
}

export function useChatSession<T>(selector: (state: ChatSessionState) => T, equalityFn?: (a: T, b: T) => boolean): T {
  const store = useContext(ChatSessionContext);
  if (!store) throw new Error("useChatSession must be used within ChatSessionProvider");
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
