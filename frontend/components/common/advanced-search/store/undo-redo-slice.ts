import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReadonlyURLSearchParams } from "next/navigation";

import { createFilterFromTag, type FilterTag, type FilterTagFocusState } from "../types";
import type { SliceCreator } from "./types";

const MAX_UNDO_STACK = 50;

export interface UndoSnapshot {
  tags: FilterTag[];
  inputValue: string;
}

export interface UndoRedoSlice {
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];
  pushUndoSnapshot: () => void;
  undo: (router: AppRouterInstance, pathname: string, searchParams: ReadonlyURLSearchParams) => void;
  redo: (router: AppRouterInstance, pathname: string, searchParams: ReadonlyURLSearchParams) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const createUndoRedoSlice: SliceCreator<UndoRedoSlice> = (
  set,
  get,
  { getLastCommittedSnapshot, setLastCommittedSnapshot, setLastSubmitted }
) => ({
  undoStack: [],
  redoStack: [],

  pushUndoSnapshot: () => {
    const { undoStack } = get();
    set({
      undoStack: [...undoStack.slice(-(MAX_UNDO_STACK - 1)), getLastCommittedSnapshot()],
      redoStack: [],
    });
  },

  undo: (router, pathname, searchParams) => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;

    const previous = undoStack[undoStack.length - 1];

    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, getLastCommittedSnapshot()],
      tags: previous.tags,
      inputValue: previous.inputValue,
      selectedTagIds: new Set<string>(),
      tagFocusStates: new Map<string, FilterTagFocusState>(),
    });

    setLastCommittedSnapshot({
      tags: previous.tags.map((t) => ({ ...t, value: Array.isArray(t.value) ? [...t.value] : t.value })),
      inputValue: previous.inputValue,
    });

    const { onSubmit, mode } = get();
    const filterObjects = previous.tags.map(createFilterFromTag);
    const searchValue = previous.inputValue.trim();

    if (mode === "url") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("filter");
      params.delete("search");
      params.delete("pageNumber");
      params.set("pageNumber", "0");
      filterObjects.forEach((filter) => params.append("filter", JSON.stringify(filter)));
      if (searchValue) params.set("search", searchValue);
      router.push(`${pathname}?${params.toString()}`);
    }

    setLastSubmitted({ filters: filterObjects, search: searchValue });
    onSubmit?.(filterObjects, searchValue);
  },

  redo: (router, pathname, searchParams) => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    const next = redoStack[redoStack.length - 1];

    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, getLastCommittedSnapshot()],
      tags: next.tags,
      inputValue: next.inputValue,
      selectedTagIds: new Set<string>(),
      tagFocusStates: new Map<string, FilterTagFocusState>(),
    });

    setLastCommittedSnapshot({
      tags: next.tags.map((t) => ({ ...t, value: Array.isArray(t.value) ? [...t.value] : t.value })),
      inputValue: next.inputValue,
    });

    const { onSubmit, mode } = get();
    const filterObjects = next.tags.map(createFilterFromTag);
    const searchValue = next.inputValue.trim();

    if (mode === "url") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("filter");
      params.delete("search");
      params.delete("pageNumber");
      params.set("pageNumber", "0");
      filterObjects.forEach((filter) => params.append("filter", JSON.stringify(filter)));
      if (searchValue) params.set("search", searchValue);
      router.push(`${pathname}?${params.toString()}`);
    }

    setLastSubmitted({ filters: filterObjects, search: searchValue });
    onSubmit?.(filterObjects, searchValue);
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
});
