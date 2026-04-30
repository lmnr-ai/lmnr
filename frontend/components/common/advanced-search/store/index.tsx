"use client";

import { isEqual, uniqueId } from "lodash";
import { useSearchParams } from "next/navigation";
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
import { type Filter, type FilterDataType, FilterSchema } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import { track } from "@/lib/posthog";

import {
  type AdvancedSearchMode,
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

function createCoreSlice(
  set: StoreSet,
  get: StoreGet,
  context: SliceContext,
  filters: ColumnFilter[],
  mode: AdvancedSearchMode,
  onSubmit?: (filters: Filter[], search: string) => void,
  suggestions?: Map<string, string[]>,
  resource?: string
): Omit<AdvancedSearchStore, keyof RecentsSlice | keyof UndoRedoSlice> {
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
    mode,
    resource,
    onSubmit,

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

    setTags: (tags) => {
      set({ tags });
    },

    setFilters: (filters) => {
      set({ filters });
    },

    addTag: (field) => {
      const { filters } = get();
      const columnFilter = filters.find((f) => f.key === field);
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

    addCompleteTag: (field, operator, value, router, pathname, searchParams) => {
      const { filters, onSubmit, mode } = get();
      const columnFilter = filters.find((f) => f.key === field);
      if (!columnFilter) return;

      get().pushUndoSnapshot();

      const tagValue = columnFilter.dataType === "array" && !Array.isArray(value) ? [value] : value;

      const newTag: FilterTag = {
        id: `tag-${uniqueId()}`,
        field,
        dataType: toFilterDataType(columnFilter.dataType),
        operator,
        value: tagValue,
      };

      const updatedTags = [...get().tags, newTag];
      const filterObjects = updatedTags.map(createFilterFromTag);
      const searchValue = "";

      context.setLastSubmitted({ filters: filterObjects, search: searchValue });

      set({
        tags: updatedTags,
        inputValue: "",
        isOpen: false,
        activeIndex: -1,
        activeRecentIndex: -1,
      });

      context.setLastCommittedSnapshot({
        tags: updatedTags.map((t) => ({ ...t, value: Array.isArray(t.value) ? [...t.value] : t.value })),
        inputValue: "",
      });

      get().addRecentSearch(filterObjects, searchValue);

      queueMicrotask(() => {
        if (mode === "url") {
          const params = new URLSearchParams(searchParams.toString());

          params.delete("filter");
          params.delete("search");
          params.delete("pageNumber");
          params.set("pageNumber", "0");

          filterObjects.forEach((filter) => {
            params.append("filter", JSON.stringify(filter));
          });

          router.push(`${pathname}?${params.toString()}`);
        }

        onSubmit?.(filterObjects, "");
      });

      return newTag;
    },

    removeTag: (tagId, router, pathname, searchParams) => {
      const newTags = get().tags.filter((t) => t.id !== tagId);

      set((state) => {
        const newSelectedTagIds = new Set(state.selectedTagIds);
        newSelectedTagIds.delete(tagId);
        const newFocusStates = new Map(state.tagFocusStates);
        newFocusStates.delete(tagId);

        return {
          tags: newTags,
          selectedTagIds: newSelectedTagIds,
          tagFocusStates: newFocusStates,
        };
      });

      get().submit(router, pathname, searchParams);
    },

    updateTagField: (tagId, field) => {
      const { filters } = get();
      const columnFilter = filters.find((f) => f.key === field);
      const dataType = columnFilter ? toFilterDataType(columnFilter.dataType) : "string";
      set((state) => ({
        tags: state.tags.map((t) => (t.id === tagId ? { ...t, field, dataType } : t)),
      }));
    },

    updateTagOperator: (tagId, operator) => {
      set((state) => ({
        tags: state.tags.map((t) => (t.id === tagId ? { ...t, operator } : t)),
      }));
    },

    updateTagValue: (tagId, value: string | string[]) => {
      set((state) => ({
        tags: state.tags.map((t) => (t.id === tagId ? { ...t, value } : t)),
      }));
    },

    selectAllTags: () => {
      set((state) => ({
        selectedTagIds: new Set(state.tags.map((t) => t.id)),
      }));
    },

    clearSelection: () => {
      set({ selectedTagIds: new Set<string>() });
    },

    removeSelectedTags: (router, pathname, searchParams) => {
      const { selectedTagIds, tags, tagFocusStates } = get();
      const newFocusStates = new Map(tagFocusStates);
      selectedTagIds.forEach((id) => newFocusStates.delete(id));
      const newTags = tags.filter((t) => !selectedTagIds.has(t.id));

      set({
        tags: newTags,
        selectedTagIds: new Set<string>(),
        tagFocusStates: newFocusStates,
      });

      queueMicrotask(() => {
        get().submit(router, pathname, searchParams);
      });
    },

    setTagFocusState: (tagId, focusState) => {
      set((state) => {
        const newFocusStates = new Map(state.tagFocusStates);
        newFocusStates.set(tagId, focusState);
        return { tagFocusStates: newFocusStates };
      });
    },

    getTagFocusState: (tagId) => get().tagFocusStates.get(tagId) || { type: "idle" },

    submit: (router, pathname, searchParams) => {
      const { tags, inputValue, onSubmit, mode, resource } = get();
      // Skip incomplete tags (empty value) so we don't submit invalid filters
      const completeTags = tags.filter((t) => (Array.isArray(t.value) ? t.value.length > 0 : t.value !== ""));
      const filterObjects = completeTags.map(createFilterFromTag);
      const searchValue = inputValue.trim();

      set({ isOpen: false, activeIndex: -1, activeRecentIndex: -1 });

      if (
        isEqual(context.getLastSubmitted().filters, filterObjects) &&
        context.getLastSubmitted().search === searchValue
      ) {
        return;
      }
      get().pushUndoSnapshot();

      if (filterObjects.length > 0 || searchValue.length > 0) {
        track("advanced_search", "submitted", {
          resource: resource ?? "unknown",
          filterCount: filterObjects.length,
          hasSearch: searchValue.length > 0,
          mode,
        });
      }

      if (mode === "url") {
        const params = new URLSearchParams(searchParams.toString());

        params.delete("filter");
        params.delete("search");
        params.delete("pageNumber");
        params.set("pageNumber", "0");

        filterObjects.forEach((filter) => {
          params.append("filter", JSON.stringify(filter));
        });

        if (searchValue) {
          params.set("search", searchValue);
        }

        router.push(`${pathname}?${params.toString()}`);
      }

      context.setLastSubmitted({ filters: filterObjects, search: searchValue });
      context.setLastCommittedSnapshot({
        tags: tags.map((t) => ({ ...t, value: Array.isArray(t.value) ? [...t.value] : t.value })),
        inputValue,
      });

      get().addRecentSearch(filterObjects, searchValue);

      onSubmit?.(filterObjects, searchValue);
    },

    clearAll: (router, pathname, searchParams) => {
      get().pushUndoSnapshot();
      const { mode, onSubmit } = get();

      set({
        tags: [],
        inputValue: "",
        selectedTagIds: new Set<string>(),
        isOpen: false,
        tagFocusStates: new Map<string, FilterTagFocusState>(),
      });

      if (mode === "url") {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("filter");
        params.delete("search");
        params.delete("pageNumber");
        params.set("pageNumber", "0");
        router.push(`${pathname}?${params.toString()}`);
      }

      context.setLastSubmitted({ filters: [], search: "" });
      context.setLastCommittedSnapshot({ tags: [], inputValue: "" });

      onSubmit?.([], "");
    },

    updateLastSubmitted: (filters, search) => {
      context.setLastSubmitted({ filters, search });
    },

    applyRecentSearch: (recentSearch, router, pathname, searchParams) => {
      const recentTags = recentSearch.filters.map(createTagFromFilter);
      set({
        tags: recentTags,
        inputValue: recentSearch.search,
        isOpen: false,
        activeIndex: -1,
        activeRecentIndex: -1,
      });
      queueMicrotask(() => {
        get().submit(router, pathname, searchParams);
      });
    },
  };
}

const createAdvancedSearchStore = (
  filters: ColumnFilter[],
  initialTags: FilterTag[],
  initialSearch: string,
  mode: AdvancedSearchMode,
  onSubmit?: (filters: Filter[], search: string) => void,
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
    ...createCoreSlice(set, get, context, filters, mode, onSubmit, suggestions, resource),
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

// Context & hooks

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

// Provider

interface AdvancedSearchStoreProviderProps {
  filters: ColumnFilter[];
  mode?: AdvancedSearchMode;
  initialFilters?: Filter[];
  initialSearch?: string;
  onSubmit?: (filters: Filter[], search: string) => void;
  suggestions?: Map<string, string[]>;
  storageKey?: string;
  resource?: string;
}

export const AdvancedSearchStoreProvider = ({
  children,
  filters,
  mode = "url",
  initialFilters = [],
  initialSearch = "",
  onSubmit,
  suggestions,
  storageKey,
  resource,
}: PropsWithChildren<AdvancedSearchStoreProviderProps>) => {
  const searchParams = useSearchParams();

  const { tags, search } = useMemo(() => {
    if (mode === "state") {
      return {
        tags: initialFilters.map(createTagFromFilter),
        search: initialSearch,
      };
    }

    const search = searchParams.get("search") ?? "";
    const filterParams = searchParams.getAll("filter");
    const tags: FilterTag[] = filterParams.flatMap((f) => {
      try {
        const parsed = JSON.parse(f);
        const result = FilterSchema.safeParse(parsed);

        if (!result.success) {
          return [];
        }

        const filter = result.data;
        const columnFilter = filters.find((col) => col.key === filter.column);

        if (columnFilter) {
          return [createTagFromFilter(filter)];
        }
        return [];
      } catch {
        return [];
      }
    });

    return {
      tags,
      search,
    };
  }, [searchParams, filters, mode, initialFilters, initialSearch]);

  const [storeState] = useState(() =>
    createAdvancedSearchStore(filters, tags, search, mode, onSubmit, suggestions, storageKey, resource)
  );

  // Sync filters prop into the store so dynamically-loaded columns (e.g. async
  // score columns on the evaluation datapoints page) are registered after mount.
  // Without this, addTag / addCompleteTag / updateTagField would call
  // `filters.find(...)` against the stale mount-time list and silently fail.
  useEffect(() => {
    const currentFilters = storeState.getState().filters;
    if (!isEqual(currentFilters, filters)) {
      storeState.getState().setFilters(filters);
    }
  }, [filters, storeState]);

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

export const useAdvancedSearchFilters = () => {
  const tags = useAdvancedSearchContext((state) => state.tags);
  const inputValue = useAdvancedSearchContext((state) => state.inputValue);

  return useMemo(
    () => ({
      filters: tags.map(createFilterFromTag),
      search: inputValue.trim(),
    }),
    [tags, inputValue]
  );
};
