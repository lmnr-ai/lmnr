import type { Filter } from "@/lib/actions/common/filters";
import type { Operator } from "@/lib/actions/common/operators";

import type { AdvancedSearchValue, AutocompleteCache, ColumnFilter, FilterTag, TagFocus } from "../types";
import type { Suggestion } from "../utils";

export interface RecentSearch {
  filters: Filter[];
  search: string;
  timestamp: number;
}

export interface RecentsSlice {
  recentSearches: RecentSearch[];
  addRecentSearch: (filters: Filter[], search: string) => void;
}

// Committed values, not tags, so undo can't restore a half-built tag.
export interface UndoRedoSlice {
  undoStack: AdvancedSearchValue[];
  redoStack: AdvancedSearchValue[];
  pushUndo: (value: AdvancedSearchValue) => void;
  undo: () => void;
  redo: () => void;
}

export interface SliceContext {
  storageKey?: string;
  // Last value sent to or received from the consumer, normalized.
  getCommitted: () => AdvancedSearchValue;
  setCommitted: (value: AdvancedSearchValue) => void;
  initialTags: FilterTag[];
  initialSearch: string;
  getOnChange: () => (value: AdvancedSearchValue) => void;
}

export interface AdvancedSearchStore extends RecentsSlice, UndoRedoSlice {
  autocompleteData: AutocompleteCache;
  tags: FilterTag[];
  inputValue: string;
  isOpen: boolean;
  activeIndex: number;
  activeRecentIndex: number;
  selectedTagIds: Set<string>;
  focus: TagFocus | null;
  filters: ColumnFilter[];
  resource?: string;
  // When false the bar builds filters only: no full-text suggestion is offered
  // and the typed query is never committed as `search`.
  allowFreeTextSearch: boolean;
  uuidFilterColumn?: string;

  setAutocompleteData: (data: AutocompleteCache) => void;
  setInputValue: (value: string) => void;
  setIsOpen: (isOpen: boolean) => void;
  setActiveIndex: (index: number) => void;
  setActiveRecentIndex: (index: number) => void;
  addTag: (field: string) => void;
  addCompleteTag: (field: string, value: string) => void;
  applySuggestion: (suggestion: Suggestion) => void;
  removeTag: (tagId: string) => void;
  updateTagField: (tagId: string, field: string) => void;
  updateTagOperator: (tagId: string, operator: Operator) => void;
  updateTagValue: (tagId: string, value: string | string[]) => void;
  selectAllTags: () => void;
  clearSelection: () => void;
  removeSelectedTags: () => void;
  setFocus: (focus: TagFocus) => void;
  // No-op if another tag took focus first (its mousedown runs before this tag's blur).
  clearFocus: (tagId: string) => void;
  submit: () => void;
  clearAll: () => void;
  // External reflow: parent's controlled `value` changed (view switch / discard
  // / undo from a sibling). Bypasses commit so we don't echo the change back.
  reflowFromValue: (value: AdvancedSearchValue) => void;
  applyRecentSearch: (recentSearch: RecentSearch) => void;
}

export type StoreSet = {
  (partial: Partial<AdvancedSearchStore>): void;
  (fn: (state: AdvancedSearchStore) => Partial<AdvancedSearchStore>): void;
};
export type StoreGet = () => AdvancedSearchStore;

export type SliceCreator<T> = (set: StoreSet, get: StoreGet, context: SliceContext) => T;
