import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReadonlyURLSearchParams } from "next/navigation";

import type { Filter } from "@/lib/actions/common/filters";
import type { Operator } from "@/lib/actions/common/operators";

import type { AdvancedSearchMode, AutocompleteCache, ColumnFilter, FilterTag, FilterTagFocusState } from "../types";
import type { RecentsSlice } from "./recents-slice";
import type { UndoRedoSlice, UndoSnapshot } from "./undo-redo-slice";

export interface SliceContext {
  storageKey?: string;
  getLastCommittedSnapshot: () => UndoSnapshot;
  setLastCommittedSnapshot: (snapshot: UndoSnapshot) => void;
  getLastSubmitted: () => { filters: Filter[]; search: string };
  setLastSubmitted: (value: { filters: Filter[]; search: string }) => void;
  initialTags: FilterTag[];
  initialSearch: string;
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
  mode: AdvancedSearchMode;
  onSubmit?: (filters: Filter[], search: string) => void;

  getActiveTagId: () => string | null;
  setAutocompleteData: (data: AutocompleteCache) => void;
  setInputValue: (value: string) => void;
  setIsOpen: (isOpen: boolean) => void;
  setActiveIndex: (index: number) => void;
  setActiveRecentIndex: (index: number) => void;
  setOpenSelectId: (id: string | null) => void;
  setTags: (tags: FilterTag[]) => void;
  addTag: (field: string) => void;
  addCompleteTag: (
    field: string,
    operator: Operator,
    value: string,
    router: AppRouterInstance,
    pathname: string,
    searchParams: ReadonlyURLSearchParams
  ) => FilterTag | undefined;
  removeTag: (
    tagId: string,
    router: AppRouterInstance,
    pathname: string,
    searchParams: ReadonlyURLSearchParams
  ) => void;
  updateTagField: (tagId: string, field: string) => void;
  updateTagOperator: (tagId: string, operator: Operator) => void;
  updateTagValue: (tagId: string, value: string | string[]) => void;
  selectAllTags: () => void;
  clearSelection: () => void;
  removeSelectedTags: (router: AppRouterInstance, pathname: string, searchParams: ReadonlyURLSearchParams) => void;
  setTagFocusState: (tagId: string, state: FilterTagFocusState) => void;
  getTagFocusState: (tagId: string) => FilterTagFocusState;
  submit: (router: AppRouterInstance, pathname: string, searchParams: ReadonlyURLSearchParams) => void;
  clearAll: (router: AppRouterInstance, pathname: string, searchParams: ReadonlyURLSearchParams) => void;
  updateLastSubmitted: (filters: Filter[], search: string) => void;
  pushUndoSnapshot: () => void;
}

export type StoreSet = {
  (partial: Partial<AdvancedSearchStore>): void;
  (fn: (state: AdvancedSearchStore) => Partial<AdvancedSearchStore>): void;
};
export type StoreGet = () => AdvancedSearchStore;

export type SliceCreator<T> = (set: StoreSet, get: StoreGet, context: SliceContext) => T;
