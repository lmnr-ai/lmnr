"use client";

import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { fetchApi } from "@/lib/api/fetch-api";
import { createIdBatchFetcher } from "@/lib/id-batch-loader";

import { createLayoutSlice, type LayoutSlice } from "./layout";
import { createTimelineSlice, type TimelineDeps, type TimelineSlice } from "./timeline";
import { createTracesSlice, type TracesDeps, type TracesSlice } from "./traces";

/** The chat session view's state: the session's traces, the session timeline, and the trace panel layout. */
type ChatSessionState = TracesSlice & TimelineSlice & LayoutSlice & { sessionId: string };

const postIds = async <T,>(url: string, traceIds: string[]): Promise<T> => {
  const { data, error } = await fetchApi<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traceIds }),
  });
  if (error !== null) throw new Error(error);
  return data;
};

const createChatSessionStore = ({
  sessionId,
  loadTraceSpans,
  ...tracesDeps
}: TimelineDeps & TracesDeps & { sessionId: string }) =>
  createStore<ChatSessionState>()(
    // Remembers the timeline and trace panel preferences across visits.
    persist(
      (set, get) => ({
        sessionId,
        ...createTracesSlice(tracesDeps)(set, get),
        ...createTimelineSlice({ loadTraceSpans })(set, get),
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

/** The session view's state: its traces, the timeline (and the spans it has loaded), and the trace panel layout. */
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
      // One shared instance per loader, so turns that come on screen together batch into one request.
      loadReply: createIdBatchFetcher(
        (ids) => postIds<Record<string, string | null>>(`/api/projects/${projectId}/traces/output`, ids),
        { debounceMs: 50 }
      ),
      loadCounts: createIdBatchFetcher(
        (ids) => postIds<Record<string, TraceSpanCounts>>(`/api/projects/${projectId}/traces/span-counts`, ids),
        { debounceMs: 50 }
      ),
    })
  );
  return <ChatSessionContext.Provider value={store}>{children}</ChatSessionContext.Provider>;
}

export function useChatSession<T>(selector: (state: ChatSessionState) => T, equalityFn?: (a: T, b: T) => boolean): T {
  const store = useContext(ChatSessionContext);
  if (!store) throw new Error("useChatSession must be used within ChatSessionProvider");
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
