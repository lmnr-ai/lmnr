"use client";

import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { fetchApi } from "@/lib/api/fetch-api";
import { createIdBatchFetcher } from "@/lib/id-batch-loader";

import { createTracesSlice, type TracesDeps, type TracesSlice } from "./traces";

/** The chat session view's state: the session's traces. */
type ChatSessionState = TracesSlice & { sessionId: string };

const postIds = async <T,>(url: string, traceIds: string[]): Promise<T> => {
  const { data, error } = await fetchApi<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traceIds }),
  });
  if (error !== null) throw new Error(error);
  return data;
};

const createChatSessionStore = ({ sessionId, ...tracesDeps }: TracesDeps & { sessionId: string }) =>
  createStore<ChatSessionState>()((set, get) => ({
    sessionId,
    ...createTracesSlice(tracesDeps)(set, get),
  }));

const ChatSessionContext = createContext<StoreApi<ChatSessionState> | null>(null);

/** The session view's state: its traces. */
export function ChatSessionProvider({ sessionId, children }: PropsWithChildren<{ sessionId: string }>) {
  const { projectId } = useParams<{ projectId: string }>();
  const [store] = useState(() =>
    createChatSessionStore({
      sessionId,
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
