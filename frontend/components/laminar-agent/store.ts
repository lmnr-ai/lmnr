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
  /** traceId context for cross-page span navigation */
  traceIdContext: string | null;
  /** DOM element provided by SideBySideWrapper for portal rendering */
  sideBySideContainer: HTMLElement | null;
}

interface LaminarAgentActions {
  setViewMode: (mode: AgentViewMode) => void;
  collapse: () => void;
  setPrefillInput: (text: string) => void;
  clearPrefill: () => void;
  setChatMessages: (msgs: UIMessage[]) => void;
  setChatStatus: (status: AgentChatStatus) => void;
  setIsNewChatLoading: (loading: boolean) => void;
  setTraceIdContext: (traceId: string | null) => void;
  setSideBySideContainer: (el: HTMLElement | null) => void;
}

export type LaminarAgentStore = LaminarAgentState & LaminarAgentActions;

export const useLaminarAgentStore = create<LaminarAgentStore>()((set) => ({
  viewMode: "collapsed",
  prefillInput: null,
  chatMessages: [],
  chatStatus: "idle",
  isNewChatLoading: false,
  traceIdContext: null,
  sideBySideContainer: null,

  setViewMode: (viewMode) => set({ viewMode }),
  collapse: () => set({ viewMode: "collapsed" }),
  setPrefillInput: (text) => set({ prefillInput: text }),
  clearPrefill: () => set({ prefillInput: null }),
  setChatMessages: (chatMessages) => set({ chatMessages }),
  setChatStatus: (chatStatus) => set({ chatStatus }),
  setIsNewChatLoading: (isNewChatLoading) => set({ isNewChatLoading }),
  setTraceIdContext: (traceIdContext) => set({ traceIdContext }),
  setSideBySideContainer: (sideBySideContainer) => set({ sideBySideContainer }),
}));
