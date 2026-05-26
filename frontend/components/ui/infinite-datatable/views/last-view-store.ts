"use client";

import { create } from "zustand";

interface LastViewState {
  ids: Record<string, string | null>;
  setLastViewId: (projectId: string, resource: string, viewId: string | null) => void;
}

const STORAGE_KEY = "table-views";

function readStorage(): Record<string, string | null> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { ids?: Record<string, string | null> } | null;
    return parsed?.ids ?? {};
  } catch {
    return {};
  }
}

function writeStorage(ids: Record<string, string | null>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids }));
  } catch {
    // Quota / privacy-mode — non-fatal.
  }
}

export const useLastViewStore = create<LastViewState>()((set) => ({
  ids: readStorage(),
  setLastViewId: (projectId, resource, viewId) =>
    set((s) => {
      const next = { ...s.ids, [`${projectId}:${resource}`]: viewId };
      writeStorage(next);
      return { ids: next };
    }),
}));
