// TODO: remove — testing only.
// Throwaway global store for switching trace-render variants from the temporary
// control panel. Delete this file (and its consumers: tmp-control-panel,
// run-body) when the render approach is decided.
"use client";

import { create } from "zustand";

export type RenderVariant = 1 | 2 | 3;

interface TmpVariantState {
  variant: RenderVariant;
  setVariant: (variant: RenderVariant) => void;
  panelMinimized: boolean;
  setPanelMinimized: (minimized: boolean) => void;
  // TODO: remove — force the sessions-list empty/onboarding state for previewing
  // even when sessions exist.
  forceEmptyState: boolean;
  setForceEmptyState: (force: boolean) => void;
  // TODO: remove — toggle run-note rendering between the markdown renderer and
  // raw text so we can compare the two looks.
  renderNotesAsMarkdown: boolean;
  setRenderNotesAsMarkdown: (markdown: boolean) => void;
}

export const useTmpVariantStore = create<TmpVariantState>((set) => ({
  variant: 3,
  setVariant: (variant) => set({ variant }),
  panelMinimized: false,
  setPanelMinimized: (panelMinimized) => set({ panelMinimized }),
  forceEmptyState: false,
  setForceEmptyState: (forceEmptyState) => set({ forceEmptyState }),
  renderNotesAsMarkdown: true,
  setRenderNotesAsMarkdown: (renderNotesAsMarkdown) => set({ renderNotesAsMarkdown }),
}));
