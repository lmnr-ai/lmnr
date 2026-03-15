import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { create } from "zustand";

export type AgentViewMode = "fullscreen" | "collapsed" | "sidebar" | "floating";

export interface LaminarAgentState {
  viewMode: AgentViewMode;
  suggestions: string[];
  chat: Chat<UIMessage> | null;
  chatProjectId: string | null;
}

export interface LaminarAgentActions {
  setViewMode: (mode: AgentViewMode) => void;
  setSuggestions: (suggestions: string[]) => void;
  getOrCreateChat: (projectId: string) => Chat<UIMessage>;
}

export type LaminarAgentStore = LaminarAgentState & LaminarAgentActions;

export const useLaminarAgentStore = create<LaminarAgentStore>((set, get) => ({
  viewMode: "collapsed",
  suggestions: [],
  chat: null,
  chatProjectId: null,
  setViewMode: (viewMode) => set({ viewMode }),
  setSuggestions: (suggestions) => set({ suggestions }),
  getOrCreateChat: (projectId: string) => {
    const state = get();
    if (state.chat && state.chatProjectId === projectId) {
      return state.chat;
    }
    const chat = new Chat<UIMessage>({
      transport: new DefaultChatTransport({
        api: `/api/projects/${projectId}/agent`,
      }),
    });
    set({ chat, chatProjectId: projectId });
    return chat;
  },
}));
