import { create } from "zustand";

interface CreateSignalSheetStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Open state for the project-wide create-signal sheet, so any button can open it. */
export const useCreateSignalSheet = create<CreateSignalSheetStore>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** `/api/projects/<id>/signals?...` list keys, e.g. the sidenav's signal rows. */
export const isSignalsListKey = (projectId: string) => (key: unknown) =>
  typeof key === "string" && key.startsWith(`/api/projects/${projectId}/signals?`);
