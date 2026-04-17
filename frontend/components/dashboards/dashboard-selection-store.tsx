"use client";

import { createContext, type PropsWithChildren, useContext, useMemo } from "react";
import { createStore, useStore } from "zustand";
import { shallow } from "zustand/shallow";

interface DashboardSelectionState {
  startLabel: string | null;
  endLabel: string | null;
  isDragging: boolean;
}

interface DashboardSelectionActions {
  startDrag: (label: string) => void;
  updateDrag: (label: string) => void;
  endDrag: () => void;
  clearSelection: () => void;
}

export type DashboardSelectionStore = DashboardSelectionState & DashboardSelectionActions;

const createDashboardSelectionStore = () =>
  createStore<DashboardSelectionStore>((set) => ({
    startLabel: null,
    endLabel: null,
    isDragging: false,
    startDrag: (label) => set({ startLabel: label, endLabel: null, isDragging: true }),
    updateDrag: (label) =>
      set((state) => {
        if (!state.isDragging) return state;
        return { endLabel: label };
      }),
    endDrag: () => set({ isDragging: false }),
    clearSelection: () => set({ startLabel: null, endLabel: null, isDragging: false }),
  }));

type DashboardSelectionStoreApi = ReturnType<typeof createDashboardSelectionStore>;

const DashboardSelectionContext = createContext<DashboardSelectionStoreApi | null>(null);

export const DashboardSelectionProvider = ({ children }: PropsWithChildren) => {
  const store = useMemo(() => createDashboardSelectionStore(), []);

  return <DashboardSelectionContext.Provider value={store}>{children}</DashboardSelectionContext.Provider>;
};

export const useDashboardSelectionStore = <T,>(selector: (state: DashboardSelectionStore) => T): T => {
  const store = useContext(DashboardSelectionContext);
  if (!store) {
    throw new Error("useDashboardSelectionStore must be used within a DashboardSelectionProvider");
  }
  return useStore(store, selector, shallow);
};
