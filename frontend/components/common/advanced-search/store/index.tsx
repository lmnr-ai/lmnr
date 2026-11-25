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
import { useShallow } from "zustand/react/shallow";

import { dataTypeOperationsMap, toFilterDataType } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { Operator, valueForOperator } from "@/lib/actions/common/operators";
import { track } from "@/lib/posthog";

import {
  type AdvancedSearchValue,
  type ColumnFilter,
  createTagFromFilter,
  type FilterTag,
  type FilterTagRef,
  getOperationsForField,
  type TagFocus,
  normalizeValue,
  type TagFocusPosition,
  valueFromTags,
} from "../types";
import { buildSuggestions, getNextField, getPreviousField, hasUuidSuggestion, type Suggestion } from "../utils";
import { createRecentsSlice, type RecentsSlice } from "./recents-slice";
import type { AdvancedSearchStore, SliceContext, StoreGet, StoreSet } from "./types";
import { createUndoRedoSlice, type UndoRedoSlice } from "./undo-redo-slice";

export type { RecentSearch } from "./recents-slice";
export type { AdvancedSearchStore } from "./types";

const defaultOperator = (columnFilter: ColumnFilter): Operator =>
  dataTypeOperationsMap[columnFilter.dataType]?.[0]?.key ?? Operator.Eq;

function buildCommit(get: StoreGet, context: SliceContext, resource?: string) {
  return () => {
    const { tags, inputValue, allowFreeTextSearch } = get();
    // Filters-only mode: the typed text is a picker buffer, never a full-text query.
    const next = valueFromTags(tags, allowFreeTextSearch ? inputValue : "");
    const last = context.getCommitted();
    if (isEqual(last, next)) return;

    get().pushUndo(last);
    if (next.filters.length > 0 || next.search.length > 0) {
      track("advanced_search", "submitted", {
        resource: resource ?? "unknown",
        filterCount: next.filters.length,
        hasSearch: next.search.length > 0,
      });
    }
    context.setCommitted(next);
    get().addRecentSearch(next.filters, next.search);
    context.getOnChange()(next);
  };
}

function createCoreSlice(
  set: StoreSet,
  get: StoreGet,
  context: SliceContext,
  filters: ColumnFilter[],
  allowFreeTextSearch: boolean,
  suggestions?: Map<string, string[]>,
  resource?: string,
  uuidFilterColumn?: string
): Omit<AdvancedSearchStore, keyof RecentsSlice | keyof UndoRedoSlice> {
  const commit = buildCommit(get, context, resource);

  return {
    allowFreeTextSearch,
    autocompleteData: suggestions || new Map(),
    tags: context.initialTags,
    inputValue: context.initialSearch,
    isOpen: false,
    activeIndex: -1,
    activeRecentIndex: -1,
    selectedTagIds: new Set<string>(),
    focus: null,

    filters,
    resource,
    uuidFilterColumn,

    setAutocompleteData: (data) => set({ autocompleteData: data }),
    setInputValue: (value) => set({ inputValue: value, activeIndex: -1, activeRecentIndex: -1 }),
    // Opening onto a UUID pre-selects the id suggestion (always index 0, see
    // `buildSuggestions`) so Enter applies the id filter without an explicit
    // arrow-down — the common case for pasting an id. Re-derived from current
    // state on every open rather than cached, so it stays correct whether the
    // dropdown opens from typing, focus, or a click.
    setIsOpen: (isOpen) => {
      if (!isOpen) {
        set({ isOpen, activeIndex: -1, activeRecentIndex: -1 });
        return;
      }
      const { inputValue, filters: columnFilters, uuidFilterColumn } = get();
      const activeIndex = hasUuidSuggestion(inputValue, columnFilters, uuidFilterColumn) ? 0 : -1;
      set({ isOpen, activeIndex, activeRecentIndex: -1 });
    },
    setActiveIndex: (activeIndex) => set({ activeIndex, activeRecentIndex: -1 }),
    setActiveRecentIndex: (activeRecentIndex) => set({ activeRecentIndex, activeIndex: -1 }),

    addTag: (field) => {
      const columnFilter = get().filters.find((f) => f.key === field);
      if (!columnFilter) return;

      const newTag: FilterTag = {
        id: `tag-${uniqueId()}`,
        field,
        dataType: toFilterDataType(columnFilter.dataType),
        operator: defaultOperator(columnFilter),
        value: columnFilter.dataType === "array" ? [] : "",
      };

      set((state) => ({
        tags: [...state.tags, newTag],
        inputValue: "",
        isOpen: false,
        activeIndex: -1,
        activeRecentIndex: -1,
        focus: { tagId: newTag.id, position: "value", mode: "edit" },
      }));
    },

    addCompleteTag: (field, value) => {
      const columnFilter = get().filters.find((f) => f.key === field);
      if (!columnFilter) return;

      const tagValue = columnFilter.dataType === "array" && !Array.isArray(value) ? [value] : value;
      const newTag: FilterTag = {
        id: `tag-${uniqueId()}`,
        field,
        dataType: toFilterDataType(columnFilter.dataType),
        operator: defaultOperator(columnFilter),
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
    },

    applySuggestion: (suggestion) => {
      if (suggestion.type === "field") {
        get().addTag(suggestion.filter.key);
      } else if (suggestion.type === "value") {
        get().addCompleteTag(suggestion.field, suggestion.value);
      } else {
        set({ inputValue: suggestion.value });
        get().submit();
      }
    },

    removeTag: (tagId) => {
      set((state) => {
        const newTags = state.tags.filter((t) => t.id !== tagId);
        const newSelectedTagIds = new Set(state.selectedTagIds);
        newSelectedTagIds.delete(tagId);
        return {
          tags: newTags,
          selectedTagIds: newSelectedTagIds,
          focus: state.focus?.tagId === tagId ? null : state.focus,
        };
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
        tags: state.tags.map((t) =>
          t.id === tagId && !Array.isArray(t.value)
            ? { ...t, operator, value: valueForOperator(operator, t.operator, t.value) }
            : t.id === tagId
              ? { ...t, operator }
              : t
        ),
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
      set((state) => ({
        tags: state.tags.filter((t) => !state.selectedTagIds.has(t.id)),
        selectedTagIds: new Set<string>(),
        focus: state.focus && state.selectedTagIds.has(state.focus.tagId) ? null : state.focus,
      }));
      queueMicrotask(commit);
    },

    setFocus: (focus) => set({ focus }),

    clearFocus: (tagId) => {
      if (get().focus?.tagId === tagId) set({ focus: null });
    },

    submit: () => {
      const { allowFreeTextSearch } = get();
      set({
        isOpen: false,
        activeIndex: -1,
        activeRecentIndex: -1,
        // Filters-only: typed text is a picker buffer, not a committed query.
        ...(allowFreeTextSearch ? {} : { inputValue: "" }),
      });
      commit();
    },

    clearAll: () => {
      set({
        tags: [],
        inputValue: "",
        selectedTagIds: new Set<string>(),
        isOpen: false,
        focus: null,
      });
      commit();
    },

    // External change (view switch, discard): no onChange echo.
    reflowFromValue: (value) => {
      const next = normalizeValue(value);
      if (isEqual(context.getCommitted(), next)) return;
      set({
        tags: value.filters.map(createTagFromFilter),
        inputValue: value.search,
        selectedTagIds: new Set<string>(),
        focus: null,
        activeIndex: -1,
      });
      context.setCommitted(next);
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
  getOnChange: () => (value: AdvancedSearchValue) => void,
  allowFreeTextSearch: boolean,
  suggestions?: Map<string, string[]>,
  storageKey?: string,
  resource?: string,
  uuidFilterColumn?: string
) => {
  let committed = valueFromTags(initialTags, allowFreeTextSearch ? initialSearch : "");

  const context: SliceContext = {
    storageKey,
    initialTags,
    initialSearch,
    getOnChange,
    getCommitted: () => committed,
    setCommitted: (value) => {
      committed = value;
    },
  };

  const storeConfig = (set: StoreSet, get: StoreGet): AdvancedSearchStore => ({
    ...createCoreSlice(set, get, context, filters, allowFreeTextSearch, suggestions, resource, uuidFilterColumn),
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

// Shallow-compared so object selectors don't re-render on unrelated store changes.
export const useAdvancedSearchContext = <T,>(selector: (store: AdvancedSearchStore) => T): T => {
  const store = useContext(AdvancedSearchStoreContext);
  if (!store) {
    throw new Error("useAdvancedSearchContext must be used within AdvancedSearchStoreProvider");
  }
  return useStore(store, useShallow(selector));
};

export const useTag = (tagId: string): FilterTag | undefined =>
  useAdvancedSearchContext((state) => state.tags.find((t) => t.id === tagId));

export const useSuggestions = (): Suggestion[] => {
  const { inputValue, filters, autocompleteData, uuidFilterColumn, allowFreeTextSearch } = useAdvancedSearchContext(
    (state) => ({
      inputValue: state.inputValue,
      filters: state.filters,
      autocompleteData: state.autocompleteData,
      uuidFilterColumn: state.uuidFilterColumn,
      allowFreeTextSearch: state.allowFreeTextSearch,
    })
  );
  return useMemo(
    () => buildSuggestions(inputValue, filters, autocompleteData, uuidFilterColumn, allowFreeTextSearch),
    [inputValue, filters, autocompleteData, uuidFilterColumn, allowFreeTextSearch]
  );
};

export interface AdvancedSearchRefs {
  mainInputRef: RefObject<HTMLInputElement | null>;
  tagHandlesRef: RefObject<Map<string, FilterTagRef>>;
}

const AdvancedSearchRefsContext = createContext<AdvancedSearchRefs | undefined>(undefined);

export const AdvancedSearchRefsProvider = AdvancedSearchRefsContext.Provider;

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
  onChange: (value: AdvancedSearchValue) => void;
  allowFreeTextSearch?: boolean;
  suggestions?: Map<string, string[]>;
  storageKey?: string;
  resource?: string;
  // When set, a bare UUID typed into the search box pre-selects an
  // exact-match filter suggestion on this column, so Enter applies it
  // without an extra arrow-down. Explicitly picking full-text search (or
  // blurring without selecting anything) still searches the raw value.
  uuidFilterColumn?: string;
}

export const AdvancedSearchStoreProvider = ({
  children,
  filters,
  initialFilters,
  initialSearch,
  onChange,
  allowFreeTextSearch = true,
  suggestions,
  storageKey,
  resource,
  uuidFilterColumn,
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
      allowFreeTextSearch,
      suggestions,
      storageKey,
      resource,
      uuidFilterColumn
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

export const useTagFocus = (tagId: string): TagFocus | null =>
  useAdvancedSearchContext((state) => (state.focus?.tagId === tagId ? state.focus : null));

// Reads state at call time instead of subscribing.
export const useAdvancedSearchNavigation = () => {
  const store = useContext(AdvancedSearchStoreContext);
  const { tagHandlesRef, mainInputRef } = useAdvancedSearchRefsContext();

  return useMemo(
    () => ({
      navigateToTag: (tagId: string, position: TagFocusPosition) => {
        tagHandlesRef.current.get(tagId)?.focusPosition(position);
      },

      navigateWithinTag: (tagId: string, direction: "left" | "right") => {
        const { focus, tags, filters } = store!.getState();
        if (focus?.tagId !== tagId) return;

        const tag = tags.find((t) => t.id === tagId);
        const skip: TagFocusPosition[] =
          tag && getOperationsForField(filters, tag.field, tag.dataType).length <= 1 ? ["operator"] : [];
        const targetField =
          direction === "left" ? getPreviousField(focus.position, skip) : getNextField(focus.position, skip);

        if (targetField) {
          tagHandlesRef.current.get(tagId)?.focusPosition(targetField);
          return;
        }
        const index = tags.findIndex((t) => t.id === tagId);
        if (direction === "left") {
          if (index > 0) tagHandlesRef.current.get(tags[index - 1].id)?.focusPosition("remove");
        } else if (index < tags.length - 1) {
          tagHandlesRef.current.get(tags[index + 1].id)?.focusPosition("field");
        } else {
          mainInputRef.current?.focus();
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
    [store, tagHandlesRef, mainInputRef]
  );
};
