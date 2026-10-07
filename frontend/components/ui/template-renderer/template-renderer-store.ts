import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TemplateRendererState = {
  presetTemplates: Record<string, string>; // presetKey -> templateId mapping
};

export type TemplateRendererActions = {
  setPresetTemplate: (presetKey: string, templateId: string) => void;
  getPresetTemplate: (presetKey: string) => string | undefined;
  reset: () => void;
};

const initialState: TemplateRendererState = {
  presetTemplates: {},
};

export type TemplateRendererStore = TemplateRendererState & TemplateRendererActions;

export const useTemplateRenderer = create<TemplateRendererStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setPresetTemplate: (presetKey, templateId) =>
        set((state) => ({
          presetTemplates: {
            ...state.presetTemplates,
            [presetKey]: templateId,
          },
        })),

      getPresetTemplate: (presetKey) => get().presetTemplates[presetKey],
      reset: () => set(initialState),
    }),
    {
      name: "template-renderer-storage",
      partialize: (state) => ({ presetTemplates: state.presetTemplates }),
    }
  )
);
