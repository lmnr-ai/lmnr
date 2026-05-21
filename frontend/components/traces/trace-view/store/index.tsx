import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";

import {
  applyDrag,
  DEFAULT_TARGETS,
  type ResizablePanel,
  type Targets,
  type Visible,
} from "@/components/traces/trace-view/panel-layout";

import { type BaseTraceViewStore, createBaseTraceViewSlice, TraceViewContext, type TraceViewTrace } from "./base";

export {
  MAX_ZOOM,
  MIN_ZOOM,
  type TraceSignal,
  type TraceViewListSpan,
  type TraceViewSpan,
  type TraceViewTrace,
  ZOOM_INCREMENT,
} from "./base";
export type { ResizablePanel } from "@/components/traces/trace-view/panel-layout";

/**
 * What kind of state change last affected layout. Drives transition selection
 * in the layout component (drag/container = instant, visibility = spring).
 */
export type LayoutChangeSource = "initial" | "drag" | "container" | "visibility";

interface TraceViewStoreState {
  targets: Targets;
  maxWidth: number;
  layoutChangeSource: LayoutChangeSource;
}

interface TraceViewStoreActions {
  resizePanel: (panel: ResizablePanel, delta: number, visible: Visible) => void;
  setMaxWidth: (maxWidth: number) => void;
}

type TraceViewStore = BaseTraceViewStore & TraceViewStoreState & TraceViewStoreActions;

const createTraceViewStore = (options?: {
  initialTrace?: TraceViewTrace;
  storeKey?: string;
  isAlwaysSelectSpan?: boolean;
  initialSignalId?: string;
  initialChatOpen?: boolean;
}) =>
  createStore<TraceViewStore>()(
    persist(
      (set, get) => {
        const baseSlice = createBaseTraceViewSlice<TraceViewStore>(set, get, {
          initialTrace: options?.initialTrace,
          isAlwaysSelectSpan: options?.isAlwaysSelectSpan,
          initialSignalId: options?.initialSignalId,
          initialChatOpen: options?.initialChatOpen,
        });

        return {
          ...baseSlice,

          targets: DEFAULT_TARGETS,
          maxWidth: Infinity,
          layoutChangeSource: "initial",

          setMaxWidth: (maxWidth: number) => {
            const current = get().maxWidth;
            if (Math.abs(maxWidth - current) < 1) return;
            set({ maxWidth, layoutChangeSource: "container" } as Partial<TraceViewStore>);
          },

          resizePanel: (panel, delta, visible) => {
            const state = get();
            const next = applyDrag(state.targets, visible, panel, delta, state.maxWidth);
            if (next === state.targets) return;
            set({ targets: next, layoutChangeSource: "drag" } as Partial<TraceViewStore>);
          },

          setSelectedSpan: (span) => {
            baseSlice.setSelectedSpan(span);
            set({ layoutChangeSource: "visibility" } as Partial<TraceViewStore>);
          },

          setSpanPanelOpen: (open) => {
            baseSlice.setSpanPanelOpen(open);
            set({ layoutChangeSource: "visibility" } as Partial<TraceViewStore>);
          },

          setTracesAgentOpen: (open) => {
            baseSlice.setTracesAgentOpen(open);
            set({ layoutChangeSource: "visibility" } as Partial<TraceViewStore>);
          },
        };
      },
      {
        name: options?.storeKey ?? "trace-view-state",
        version: 2,
        migrate: (persistedState, version) => {
          if (!persistedState || typeof persistedState !== "object") return persistedState as TraceViewStore;
          const s = persistedState as Record<string, unknown>;

          if (version < 1) s.tab = "transcript";

          if (version < 2) {
            const trace = s.tracePanelWidth;
            const span = s.spanPanelWidth;
            const chat = s.chatPanelWidth;
            if (typeof trace === "number" && typeof span === "number" && typeof chat === "number") {
              s.targets = { trace, span, chat };
            }
            delete s.tracePanelWidth;
            delete s.spanPanelWidth;
            delete s.chatPanelWidth;
          }

          return persistedState as TraceViewStore;
        },
        partialize: (state) => {
          const persistentTabs = ["tree", "transcript"] as const;
          const tabToPersist = persistentTabs.includes(state.tab as any) ? state.tab : undefined;

          return {
            targets: state.targets,
            ...(tabToPersist && { tab: tabToPersist }),
            showTreeContent: state.showTreeContent,
            condensedTimelineEnabled: state.condensedTimelineEnabled,
          };
        },
        merge: (persistedState, currentState) => {
          const persisted = (persistedState ?? {}) as Record<string, unknown>;
          const validTabs = ["tree", "transcript"] as const;
          const tab =
            persisted.tab && validTabs.includes(persisted.tab as (typeof validTabs)[number])
              ? (persisted.tab as TraceViewStore["tab"])
              : "transcript";

          const t = persisted.targets as Partial<Targets> | undefined;
          const targets: Targets =
            t && typeof t.trace === "number" && typeof t.span === "number" && typeof t.chat === "number"
              ? { trace: t.trace, span: t.span, chat: t.chat }
              : currentState.targets;

          return {
            ...currentState,
            targets,
            ...(typeof persisted.showTreeContent === "boolean" && { showTreeContent: persisted.showTreeContent }),
            ...(typeof persisted.condensedTimelineEnabled === "boolean" && {
              condensedTimelineEnabled: persisted.condensedTimelineEnabled,
            }),
            tab,
          };
        },
      }
    )
  );

const TraceViewStoreContext = createContext<StoreApi<TraceViewStore> | undefined>(undefined);

const TraceViewStoreProvider = ({
  children,
  initialTrace,
  storeKey,
  isAlwaysSelectSpan,
  initialSignalId,
  initialChatOpen,
}: PropsWithChildren<{
  initialTrace?: TraceViewTrace;
  storeKey?: string;
  isAlwaysSelectSpan?: boolean;
  initialSignalId?: string;
  initialChatOpen?: boolean;
}>) => {
  const [storeState] = useState(() =>
    createTraceViewStore({
      initialTrace,
      storeKey,
      isAlwaysSelectSpan,
      initialSignalId,
      initialChatOpen,
    })
  );

  return (
    <TraceViewContext.Provider value={storeState}>
      <TraceViewStoreContext.Provider value={storeState}>{children}</TraceViewStoreContext.Provider>
    </TraceViewContext.Provider>
  );
};

export const useTraceViewStore = <T,>(
  selector: (store: TraceViewStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const store = useContext(TraceViewStoreContext);
  if (!store) {
    throw new Error("useTraceViewStoreContext must be used within a TraceViewStoreContext");
  }

  return useStoreWithEqualityFn(store, selector, equalityFn);
};

export default TraceViewStoreProvider;
