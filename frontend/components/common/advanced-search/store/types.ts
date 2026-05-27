import type { Filter } from "@/lib/actions/common/filters";
import type { Operator } from "@/lib/actions/common/operators";

import type { AutocompleteCache, ColumnFilter, FilterTag, FilterTagFocusState } from "../types";
import type { RecentSearch, RecentsSlice } from "./recents-slice";
import type { UndoRedoSlice, UndoSnapshot } from "./undo-redo-slice";

export interface SliceContext {
  storageKey?: string;
  getLastCommittedSnapshot: () => UndoSnapshot;
  setLastCommittedSnapshot: (snapshot: UndoSnapshot) => void;
  getLastSubmitted: () => { filters: Filter[]; search: string };
  setLastSubmitted: (value: { filters: Filter[]; search: string }) => void;
  initialTags: FilterTag[];
  initialSearch: string;
  // Stable ref to the consumer-provided onChange. Called whenever the editor
  // commits a change. Never null at runtime; defaults to a no-op so the search
  // is functional even without an onChange (read-only / probing flows).
  getOnChange: () => (value: { filters: Filter[]; search: string }) => void;
}

export interface AdvancedSearchStore extends RecentsSlice, UndoRedoSlice {
  autocompleteData: AutocompleteCache;
  tags: FilterTag[];
  inputValue: string;
  isOpen: boolean;
  activeIndex: number;
  activeRecentIndex: number;
  selectedTagIds: Set<string>;
  openSelectId: string | null;
  tagFocusStates: Map<string, FilterTagFocusState>;
  filters: ColumnFilter[];
  resource?: string;

  getActiveTagId: () => string | null;
  setAutocompleteData: (data: AutocompleteCache) => void;
  setInputValue: (value: string) => void;
  setIsOpen: (isOpen: boolean) => void;
  setActiveIndex: (index: number) => void;
  setActiveRecentIndex: (index: number) => void;
  setOpenSelectId: (id: string | null) => void;
  setTags: (tags: FilterTag[]) => void;
  addTag: (field: string) => void;
  addCompleteTag: (field: string, operator: Operator, value: string) => FilterTag | undefined;
  removeTag: (tagId: string) => void;
  updateTagField: (tagId: string, field: string) => void;
  updateTagOperator: (tagId: string, operator: Operator) => void;
  updateTagValue: (tagId: string, value: string | string[]) => void;
  selectAllTags: () => void;
  clearSelection: () => void;
  removeSelectedTags: () => void;
  setTagFocusState: (tagId: string, state: FilterTagFocusState) => void;
  getTagFocusState: (tagId: string) => FilterTagFocusState;
  submit: () => void;
  clearAll: () => void;
  // External reflow: parent's controlled `value` changed (view switch / discard
  // / undo from a sibling). Bypasses commit so we don't echo the change back.
  reflowFromValue: (value: { filters: Filter[]; search: string }) => void;
  pushUndoSnapshot: () => void;
  applyRecentSearch: (recentSearch: RecentSearch) => void;
}

export type StoreSet = {
  (partial: Partial<AdvancedSearchStore>): void;
  (fn: (state: AdvancedSearchStore) => Partial<AdvancedSearchStore>): void;
};
export type StoreGet = () => AdvancedSearchStore;

export type SliceCreator<T> = (set: StoreSet, get: StoreGet, context: SliceContext) => T;
