import { type AdvancedSearchValue, createTagFromFilter } from "../types";
import type { SliceCreator, UndoRedoSlice } from "./types";

export type { UndoRedoSlice } from "./types";

const MAX_UNDO_STACK = 50;

export const createUndoRedoSlice: SliceCreator<UndoRedoSlice> = (
  set,
  get,
  { getCommitted, setCommitted, getOnChange }
) => {
  const step = (from: "undoStack" | "redoStack", to: "undoStack" | "redoStack") => {
    const stack = get()[from];
    const target = stack.at(-1);
    if (!target) return;
    set({
      [from]: stack.slice(0, -1),
      [to]: [...get()[to], getCommitted()],
      tags: target.filters.map(createTagFromFilter),
      inputValue: target.search,
      selectedTagIds: new Set<string>(),
      focus: null,
    });
    setCommitted(target);
    getOnChange()(target);
  };

  return {
    undoStack: [],
    redoStack: [],
    pushUndo: (value: AdvancedSearchValue) =>
      set((state) => ({ undoStack: [...state.undoStack.slice(-(MAX_UNDO_STACK - 1)), value], redoStack: [] })),
    undo: () => step("undoStack", "redoStack"),
    redo: () => step("redoStack", "undoStack"),
  };
};
