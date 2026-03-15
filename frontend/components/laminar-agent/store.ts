import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { create } from "zustand";

import type { UrlContext } from "@/lib/actions/agent/prompt";

export type AgentViewMode = "fullscreen" | "collapsed" | "sidebar" | "floating";

export interface LaminarAgentState {
  viewMode: AgentViewMode;
  chat: Chat<UIMessage> | null;
  chatProjectId: string | null;
  persistedMessages: UIMessage[];
}

export interface LaminarAgentActions {
  setViewMode: (mode: AgentViewMode) => void;
  getOrCreateChat: (projectId: string) => Chat<UIMessage>;
  setPersistedMessages: (messages: UIMessage[]) => void;
}

export type LaminarAgentStore = LaminarAgentState & LaminarAgentActions;

/**
 * Mutable ref for current URL context. Updated by components that
 * have access to usePathname(). Read by the chat transport body function.
 * This avoids syncing URL state into the Zustand store (per CLAUDE.md).
 */
let currentUrlContext: UrlContext | undefined;

export function setCurrentUrlContext(ctx: UrlContext | undefined) {
  currentUrlContext = ctx;
}

export function getCurrentUrlContext(): UrlContext | undefined {
  return currentUrlContext;
}

export const useLaminarAgentStore = create<LaminarAgentStore>((set, get) => ({
  viewMode: "collapsed",
  chat: null,
  chatProjectId: null,
  persistedMessages: [],
  setViewMode: (viewMode) => set({ viewMode }),
  setPersistedMessages: (messages) => set({ persistedMessages: messages }),
  getOrCreateChat: (projectId: string) => {
    const state = get();
    if (state.chat && state.chatProjectId === projectId) {
      return state.chat;
    }
    const chat = new Chat<UIMessage>({
      messages: state.persistedMessages,
      transport: new DefaultChatTransport({
        api: `/api/projects/${projectId}/agent`,
        body: () => ({
          urlContext: currentUrlContext,
        }),
      }),
    });
    set({ chat, chatProjectId: projectId });
    return chat;
  },
}));
