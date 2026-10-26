"use client";

import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore } from "zustand";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

// Marks a preview card as a drop target for charts dragged off the grid.
export const DROP_DASHBOARD_ATTR = "data-drop-dashboard-id";

interface DashboardPreviewsState {
  isOpen: boolean;
  isDraggingChart: boolean;
  // Preview a dragged chart is currently over, i.e. where it would move on drop.
  dropTargetId: string | null;
}

interface DashboardPreviewsActions {
  toggle: () => void;
  dragChart: (dropTargetId: string | null) => void;
  endChartDrag: () => void;
}

export type DashboardPreviewsStore = DashboardPreviewsState & DashboardPreviewsActions;

const createDashboardPreviewsStore = () =>
  createStore<DashboardPreviewsStore>((set) => ({
    isOpen: false,
    isDraggingChart: false,
    dropTargetId: null,
    toggle: () => set((state) => ({ isOpen: !state.isOpen })),
    dragChart: (dropTargetId) => set({ isDraggingChart: true, dropTargetId }),
    endChartDrag: () => set({ isDraggingChart: false, dropTargetId: null }),
  }));

type DashboardPreviewsStoreApi = ReturnType<typeof createDashboardPreviewsStore>;

const DashboardPreviewsContext = createContext<DashboardPreviewsStoreApi | null>(null);

export const DashboardPreviewsProvider = ({ children }: PropsWithChildren) => {
  const [store] = useState(() => createDashboardPreviewsStore());

  return <DashboardPreviewsContext.Provider value={store}>{children}</DashboardPreviewsContext.Provider>;
};

export const useDashboardPreviewsStore = <T,>(selector: (state: DashboardPreviewsStore) => T): T => {
  const store = useContext(DashboardPreviewsContext);
  if (!store) {
    throw new Error("useDashboardPreviewsStore must be used within a DashboardPreviewsProvider");
  }
  return useStoreWithEqualityFn(store, selector, shallow);
};
