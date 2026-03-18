import { type UIMessage } from "ai";
import { create } from "zustand";

export type AgentViewMode = "collapsed" | "floating" | "side-by-side";

export type AgentChatStatus = "idle" | "submitted" | "streaming";

interface LaminarAgentState {
  viewMode: AgentViewMode;
  prefillInput: string | null;
  chatMessages: UIMessage[];
  chatStatus: AgentChatStatus;
  isNewChatLoading: boolean;
}

interface LaminarAgentActions {
  setViewMode: (mode: AgentViewMode) => void;
  collapse: () => void;
  setPrefillInput: (text: string) => void;
  clearPrefill: () => void;
  setChatMessages: (msgs: UIMessage[]) => void;
  setChatStatus: (status: AgentChatStatus) => void;
  setIsNewChatLoading: (loading: boolean) => void;
}

export type LaminarAgentStore = LaminarAgentState & LaminarAgentActions;

export const useLaminarAgentStore = create<LaminarAgentStore>()((set) => ({
  viewMode: "collapsed",
  prefillInput: null,
  chatMessages: [],
  chatStatus: "idle",
  isNewChatLoading: false,

  setViewMode: (viewMode) => set({ viewMode }),
  collapse: () => set({ viewMode: "collapsed" }),
  setPrefillInput: (text) => set({ prefillInput: text }),
  clearPrefill: () => set({ prefillInput: null }),
  setChatMessages: (chatMessages) => set({ chatMessages }),
  setChatStatus: (chatStatus) => set({ chatStatus }),
  setIsNewChatLoading: (isNewChatLoading) => set({ isNewChatLoading }),
}));
