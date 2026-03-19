import { type UIMessage } from "ai";
import { useEffect } from "react";
import { create, type StoreApi } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { type Store as SignalStore } from "@/components/signal/store";
import { type BaseTraceViewStore } from "@/components/traces/trace-view/store/base";

export interface LaminarAgentRegistry {
  traceView: BaseTraceViewStore;
  signal: SignalStore;
}

export type LaminarAgentContextKey = keyof LaminarAgentRegistry;
export type LaminarAgentContextRefs = { [K in LaminarAgentContextKey]?: StoreApi<LaminarAgentRegistry[K]> };

export type AgentViewMode = "collapsed" | "floating" | "side-by-side";

export type AgentChatStatus = "idle" | "submitted" | "streaming";

interface LaminarAgentState {
  viewMode: AgentViewMode;
  prefillInput: string | null;
  chatMessages: UIMessage[];
  chatStatus: AgentChatStatus;
  isNewChatLoading: boolean;
  /** traceId context for cross-page span navigation */
  /** DOM element provided by SideBySideWrapper for portal rendering */
  sideBySideContainer: HTMLElement | null;
  /** Whether an AI provider is configured (set from server layout) */
  activeContext?: LaminarAgentContextKey;
  refs: LaminarAgentContextRefs;
}

interface LaminarAgentActions {
  setViewMode: (mode: AgentViewMode) => void;
  collapse: () => void;
  setPrefillInput: (text: string) => void;
  clearPrefill: () => void;
  setChatMessages: (msgs: UIMessage[]) => void;
  setChatStatus: (status: AgentChatStatus) => void;
  setIsNewChatLoading: (loading: boolean) => void;
  setSideBySideContainer: (el: HTMLElement | null) => void;
  register: <K extends LaminarAgentContextKey>(key: K, store: StoreApi<LaminarAgentRegistry[K]>) => () => void;
}

export type LaminarAgentStore = LaminarAgentState & LaminarAgentActions;

export const laminarAgentStore = create<LaminarAgentStore>()((set, get) => ({
  viewMode: "collapsed",
  prefillInput: null,
  chatMessages: [],
  chatStatus: "idle",
  isNewChatLoading: false,
  sideBySideContainer: null,
  activeContext: undefined,
  refs: {},

  setViewMode: (viewMode) => set({ viewMode }),
  collapse: () => set({ viewMode: "collapsed" }),
  setPrefillInput: (text) => set({ prefillInput: text }),
  clearPrefill: () => set({ prefillInput: null }),
  setChatMessages: (chatMessages) => set({ chatMessages }),
  setChatStatus: (chatStatus) => set({ chatStatus }),
  setIsNewChatLoading: (isNewChatLoading) => set({ isNewChatLoading }),
  setSideBySideContainer: (sideBySideContainer) => set({ sideBySideContainer }),

  register: (key, store) => {
    set({
      refs: { ...get().refs, [key]: store },
      activeContext: key,
    });
    return () => {
      const { [key]: _, ...refs } = get().refs;
      const remaining = Object.keys(refs) as LaminarAgentContextKey[];
      const nextActive = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
      set({ refs, activeContext: nextActive });
    };
  },
}));

export const useLaminarAgentStore = <T>(selector: (state: LaminarAgentStore) => T): T =>
  laminarAgentStore(useShallow(selector));

export const useRegisterLaminarAgentContext = <K extends LaminarAgentContextKey>(
  key: K,
  store: StoreApi<LaminarAgentRegistry[K]>
) => {
  useEffect(() => laminarAgentStore.getState().register(key, store), [key, store]);
};
