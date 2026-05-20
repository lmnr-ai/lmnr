"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LastViewState {
  ids: Record<string, string | null>;
  setLastViewId: (projectId: string, resourceType: string, viewId: string | null) => void;
}

export const useLastViewStore = create<LastViewState>()(
  persist(
    (set) => ({
      ids: {},
      setLastViewId: (projectId, resourceType, viewId) =>
        set((s) => ({ ids: { ...s.ids, [`${projectId}:${resourceType}`]: viewId } })),
    }),
    {
      name: "lmn:last-views",
      partialize: (s) => ({ ids: s.ids }),
    }
  )
);
