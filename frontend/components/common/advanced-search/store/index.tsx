"use client";

import { isEqual, uniqueId } from "lodash";
import {
  createContext,
  type PropsWithChildren,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import { dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter, type FilterDataType } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import { track } from "@/lib/posthog";

import {
  type ColumnFilter,
  createFilterFromTag,
  createTagFromFilter,
  type FilterTag,
  type FilterTagFocusState,
  type FilterTagRef,
  type TagFocusPosition,
} from "../types";
import { getNextField, getPreviousField } from "../utils";
import { createRecentsSlice, type RecentsSlice } from "./recents-slice";
import type { AdvancedSearchStore, SliceContext, StoreGet, StoreSet } from "./types";
import { createUndoRedoSlice, type UndoRedoSlice, type UndoSnapshot } from "./undo-redo-slice";

export type { RecentSearch } from "./recents-slice";
export type { AdvancedSearchStore } from "./types";

function toFilterDataType(uiDataType: ColumnFilter["dataType"]): FilterDataType {
  return uiDataType === "enum" ? "string" : uiDataType;
}

// Stable wrapper around `tags + inputValue → onChange`. Pulls fresh values
// from the store and routes them to the consumer-provided onChange via the
// SliceContext getter (so the callback ref can change without re-creating the
// store).
function buildCommit(get: StoreGet, context: SliceContext, resource?: string) {
  return () => {
    const { tags, inputValue } = get();
    // Drop tags with no value — they're mid-edit and shouldn't ship.
    const completeTags = tags.filter((t) => (Array.isArray(t.value) ? t.value.length > 0 : t.value !== ""));
    const filterObjects = completeTags.map(createFilterFromTag);
    const searchValue = inputValue.trim();

    // No-op if nothing changed since last commit.
    const last = context.getLastSubmitted();
    if (isEqual(last.filters, filterObjects) && last.search === searchValue) {
      return;
    }
    get().pushUndoSnapshot();

    if (filterObjects.length > 0 || searchValue.length > 0) {
      track("advanced_search", "submitted", {
        resource: resource ?? "unknown",
        filterCount: filterObjects.length,
        hasSearch: searchValue.length > 0,
      });
    }

    context.setLastSubmitted({ filters: filterObjects, search: searchValue });
    context.setLastCommittedSnapshot({
      tags: tags.map((t) => ({ ...t, value: Array.isArray(t.value) ? [...t.value] : t.value })),
      inputValue,
    });

    get().addRecentSearch(filterObjects, searchValue);
    context.getOnChange()({ filters: filterObjects, search: searchValue });
  };
}

function createCoreSlice(
  set: StoreSet,
  get: StoreGet,
  context: SliceContext,
  filters: ColumnFilter[],
  suggestions?: Map<string, string[]>,
  resource?: string
): Omit<AdvancedSearchStore, keyof RecentsSlice | keyof UndoRedoSlice> {
  const commit = buildCommit(get, context, resource);

  return {
    autocompleteData: suggestions || new Map(),
    tags: context.initialTags,
    inputValue: context.initialSearch,
    isOpen: false,
    activeIndex: -1,
    activeRecentIndex: -1,
    selectedTagIds: new Set<string>(),
    openSelectId: null,
    tagFocusStates: new Map<string, FilterTagFocusState>(),

    filters,
    resource,

    getActiveTagId: () => {
      const { tagFocusStates } = get();
      for (const [tagId, focusState] of tagFocusStates) {
        if (focusState.type !== "idle") return tagId;
      }
      return null;
    },

    setAutocompleteData: (data) => set({ autocompleteData: data }),
    setInputValue: (value) => set({ inputValue: value, activeIndex: -1, activeRecentIndex: -1 }),
    setIsOpen: (isOpen) => set({ isOpen, activeIndex: -1, activeRecentIndex: -1 }),
    setActiveIndex: (activeIndex) => set({ activeIndex, activeRecentIndex: -1 }),
    setActiveRecentIndex: (activeRecentIndex) => set({ activeRecentIndex, activeIndex: -1 }),
    setOpenSelectId: (openSelectId) => set({ openSelectId }),

    setTags: (tags) => set({ tags }),

    addTag: (field) => {
      const columnFilter = get().filters.find((f) => f.key === field);
      if (!columnFilter) return;

      const operations = dataTypeOperationsMap[columnFilter.dataType];
      const defaultOperator = operations?.[0]?.key ?? Operator.Eq;
      const defaultValue = columnFilter.dataType === "array" ? [] : "";

      const newTag: FilterTag = {
        id: `tag-${uniqueId()}`,
        field,
        dataType: toFilterDataType(columnFilter.dataType),
        operator: defaultOperator,
        value: defaultValue,
      };

      set((state) => {
        const newFocusStates = new Map(state.tagFocusStates);
        newFocusStates.set(newTag.id, { type: "value", mode: "edit" });
        return {
          tags: [...state.tags, newTag],
          inputValue: "",
          isOpen: false,
          activeIndex: -1,
          activeRecentIndex: -1,
          tagFocusStates: newFocusStates,
        };
      });
    },

    addCompleteTag: (field, operator, value) => {
      const columnFilter = get().filters.find((f) => f.key === field);
      if (!columnFilter) return;

      const tagValue = columnFilter.dataType === "array" && !Array.isArray(value) ? [value] : value;
      const newTag: FilterTag = {
        id: `tag-${uniqueId()}`,
        field,
        dataType: toFilterDataType(columnFilter.dataType),
        operator,
        value: tagValue,
      };

      set((state) => ({
        tags: [...state.tags, newTag],
        inputValue: "",
        isOpen: false,
        activeIndex: -1,
        activeRecentIndex: -1,
      }));

      // Defer so the state set above flushes before commit reads it.
      queueMicrotask(commit);
      return newTag;
    },

    removeTag: (tagId) => {
      set((state) => {
        const newTags = state.tags.filter((t) => t.id !== tagId);
        const newSelectedTagIds = new Set(state.selectedTagIds);
        newSelectedTagIds.delete(tagId);
        const newFocusStates = new Map(state.tagFocusStates);
        newFocusStates.delete(tagId);
        return { tags: newTags, selectedTagIds: newSelectedTagIds, tagFocusStates: newFocusStates };
      });
      queueMicrotask(commit);
    },

    updateTagField: (tagId, field) => {
      const columnFilter = get().filters.find((f) => f.key === field);
      const dataType = columnFilter ? toFilterDataType(columnFilter.dataType) : "string";
      set((state) => ({
        tags: state.tags.map((t) => (t.id === tagId ? { ...t, field, dataType } : t)),
      }));
    },

    updateTagOperator: (tagId, operator) =>
      set((state) => ({
        tags: state.tags.map((t) => (t.id === tagId ? { ...t, operator } : t)),
      })),

    updateTagValue: (tagId, value) =>
      set((state) => ({
        tags: state.tags.map((t) => (t.id === tagId ? { ...t, value } : t)),
      })),

    selectAllTags: () =>
      set((state) => ({
        selectedTagIds: new Set(state.tags.map((t) => t.id)),
      })),

    clearSelection: () => set({ selectedTagIds: new Set<string>() }),

    removeSelectedTags: () => {
      set((state) => {
        const newFocusStates = new Map(state.tagFocusStates);
        state.selectedTagIds.forEach((id) => newFocusStates.delete(id));
        return {
          tags: state.tags.filter((t) => !state.selectedTagIds.has(t.id)),
          selectedTagIds: new Set<string>(),
          tagFocusStates: newFocusStates,
        };
      });
      queueMicrotask(commit);
    },

    setTagFocusState: (tagId, focusState) =>
      set((state) => {
        const newFocusStates = new Map(state.tagFocusStates);
        newFocusStates.set(tagId, focusState);
        return { tagFocusStates: newFocusStates };
      }),

    getTagFocusState: (tagId) => get().tagFocusStates.get(tagId) || { type: "idle" },

    submit: () => {
      set({ isOpen: false, activeIndex: -1, activeRecentIndex: -1 });
      commit();
    },

    clearAll: () => {
      get().pushUndoSnapshot();
      set({
        tags: [],
        inputValue: "",
        selectedTagIds: new Set<string>(),
        isOpen: false,
        tagFocusStates: new Map<string, FilterTagFocusState>(),
      });
      context.setLastSubmitted({ filters: [], search: "" });
      context.setLastCommittedSnapshot({ tags: [], inputValue: "" });
      context.getOnChange()({ filters: [], search: "" });
    },

    reflowFromValue: ({ filters, search }) => {
      // External-driven state change (view switch, discard, undo from outside).
      // Replace the editor state and update the "last committed" snapshot so
      // the next user edit isn't perceived as a no-op against the new value.
      const newTags = filters.map(createTagFromFilter);
      set((state) => ({
        tags: newTags,
        inputValue: search,
        // Preserve transient UI bits but drop selection/focus that referenced removed tags.
        selectedTagIds: new Set<string>(),
        tagFocusStates: new Map<string, FilterTagFocusState>(),
        activeIndex: state.activeIndex >= 0 ? -1 : state.activeIndex,
      }));
      context.setLastSubmitted({ filters, search });
      context.setLastCommittedSnapshot({
        tags: newTags.map((t) => ({ ...t, value: Array.isArray(t.value) ? [...t.value] : t.value })),
        inputValue: search,
      });
    },

    applyRecentSearch: (recentSearch) => {
      const recentTags = recentSearch.filters.map(createTagFromFilter);
      set({
        tags: recentTags,
        inputValue: recentSearch.search,
        isOpen: false,
        activeIndex: -1,
        activeRecentIndex: -1,
      });
      queueMicrotask(commit);
    },
  };
}

const createAdvancedSearchStore = (
  filters: ColumnFilter[],
  initialTags: FilterTag[],
  initialSearch: string,
  getOnChange: () => (value: { filters: Filter[]; search: string }) => void,
  suggestions?: Map<string, string[]>,
  storageKey?: string,
  resource?: string
) => {
  let lastSubmitted = {
    filters: initialTags.map(createFilterFromTag),
    search: initialSearch.trim(),
  };

  let lastCommittedSnapshot: UndoSnapshot = {
    tags: initialTags.map((t) => ({ ...t, value: Array.isArray(t.value) ? [...t.value] : t.value })),
    inputValue: initialSearch,
  };

  const context: SliceContext = {
    storageKey,
    initialTags,
    initialSearch,
    getOnChange,
    getLastCommittedSnapshot: () => lastCommittedSnapshot,
    setLastCommittedSnapshot: (snapshot) => {
      lastCommittedSnapshot = snapshot;
    },
    getLastSubmitted: () => lastSubmitted,
    setLastSubmitted: (value) => {
      lastSubmitted = value;
    },
  };

  const storeConfig = (set: StoreSet, get: StoreGet): AdvancedSearchStore => ({
    ...createCoreSlice(set, get, context, filters, suggestions, resource),
    ...createRecentsSlice(set, get, context),
    ...createUndoRedoSlice(set, get, context),
  });

  if (storageKey) {
    return createStore<AdvancedSearchStore>()(
      persist(storeConfig, {
        name: `advanced-search-${storageKey}`,
        partialize: (state) => ({ recentSearches: state.recentSearches }),
        merge: (persisted, current) => ({
          ...current,
          ...(persisted as Partial<AdvancedSearchStore>),
        }),
      })
    );
  }

  return createStore<AdvancedSearchStore>()(storeConfig);
};

const AdvancedSearchStoreContext = createContext<StoreApi<AdvancedSearchStore> | undefined>(undefined);

export const useAdvancedSearchContext = <T,>(selector: (store: AdvancedSearchStore) => T): T => {
  const store = useContext(AdvancedSearchStoreContext);
  if (!store) {
    throw new Error("useAdvancedSearchContext must be used within AdvancedSearchStoreProvider");
  }
  return useStore(store, selector);
};

interface AdvancedSearchRefs {
  mainInputRef: RefObject<HTMLInputElement | null>;
  tagHandlesRef: RefObject<Map<string, FilterTagRef>>;
}

const AdvancedSearchRefsContext = createContext<AdvancedSearchRefs | undefined>(undefined);

export const useAdvancedSearchRefsContext = () => {
  const ctx = useContext(AdvancedSearchRefsContext);
  if (!ctx) {
    throw new Error("useAdvancedSearchRefsContext must be used within AdvancedSearchStoreProvider");
  }
  return ctx;
};

interface AdvancedSearchStoreProviderProps {
  filters: ColumnFilter[];
  initialFilters: Filter[];
  initialSearch: string;
  onChange: (value: { filters: Filter[]; search: string }) => void;
  suggestions?: Map<string, string[]>;
  storageKey?: string;
  resource?: string;
}

export const AdvancedSearchStoreProvider = ({
  children,
  filters,
  initialFilters,
  initialSearch,
  onChange,
  suggestions,
  storageKey,
  resource,
}: PropsWithChildren<AdvancedSearchStoreProviderProps>) => {
  // Keep a live ref to the latest onChange so the store can call it without
  // being recreated every render. The store's actions only read via the
  // SliceContext's `getOnChange()` accessor. Updating the ref via effect is
  // intentional: a one-frame lag is fine because store actions only fire
  // after user input (well past render commit).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // eslint-disable-next-line react-hooks/refs
  const [storeState] = useState(() =>
    createAdvancedSearchStore(
      filters,
      initialFilters.map(createTagFromFilter),
      initialSearch,
      () => onChangeRef.current,
      suggestions,
      storageKey,
      resource
    )
  );

  const mainInputRef = useRef<HTMLInputElement>(null);
  const tagHandlesRef = useRef<Map<string, FilterTagRef>>(new Map());

  const refsValue = useMemo(() => ({ mainInputRef, tagHandlesRef }), []);

  return (
    <AdvancedSearchStoreContext.Provider value={storeState}>
      <AdvancedSearchRefsContext.Provider value={refsValue}>{children}</AdvancedSearchRefsContext.Provider>
    </AdvancedSearchStoreContext.Provider>
  );
};

export const useAdvancedSearchNavigation = () => {
  const { tagHandlesRef, mainInputRef } = useAdvancedSearchRefsContext();
  const tags = useAdvancedSearchContext((state) => state.tags);
  const tagFocusStates = useAdvancedSearchContext((state) => state.tagFocusStates);

  return useMemo(
    () => ({
      navigateToTag: (tagId: string, position: TagFocusPosition) => {
        tagHandlesRef.current.get(tagId)?.focusPosition(position);
      },

      navigateWithinTag: (tagId: string, direction: "left" | "right") => {
        const focusState = tagFocusStates.get(tagId);
        if (!focusState || focusState.type === "idle") return;

        const currentType = focusState.type;
        const targetField = direction === "left" ? getPreviousField(currentType) : getNextField(currentType);

        if (targetField) {
          tagHandlesRef.current.get(tagId)?.focusPosition(targetField);
        } else {
          const currentIndex = tags.findIndex((t) => t.id === tagId);
          if (direction === "left") {
            if (currentIndex > 0) {
              const previousTag = tags[currentIndex - 1];
              tagHandlesRef.current.get(previousTag.id)?.focusPosition("remove");
            }
          } else {
            if (currentIndex >= 0 && currentIndex < tags.length - 1) {
              const nextTag = tags[currentIndex + 1];
              tagHandlesRef.current.get(nextTag.id)?.focusPosition("field");
            } else if (currentIndex === tags.length - 1) {
              mainInputRef.current?.focus();
            }
          }
        }
      },

      registerTagHandle: (tagId: string, handle: FilterTagRef | null) => {
        if (handle) {
          tagHandlesRef.current.set(tagId, handle);
        } else {
          tagHandlesRef.current.delete(tagId);
        }
      },
    }),
    [tags, tagFocusStates, tagHandlesRef, mainInputRef]
  );
};
