"use client";

import { isEqual, uniqueId } from "lodash";
import { type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { type ReadonlyURLSearchParams, useSearchParams } from "next/navigation";
import { createContext, type PropsWithChildren, type RefObject, useContext, useMemo, useRef } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

import { type Filter, FilterSchema } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";

import {
  type AdvancedSearchMode,
  type AutocompleteCache,
  type ColumnFilter,
  createFilterFromTag,
  createTagFromFilter,
  type FilterTag,
  type FilterTagFocusState,
  type FilterTagRef,
  type TagFocusPosition,
} from "./types";
import { getNextField, getPreviousField } from "./utils";

interface AdvancedSearchStore {
  // State
  autocompleteData: AutocompleteCache;
  tags: FilterTag[];
  inputValue: string;
  isOpen: boolean;
  activeIndex: number;
  selectedTagIds: Set<string>;
  openSelectId: string | null;
  tagFocusStates: Map<string, FilterTagFocusState>;

  // Config (from props)
  filters: ColumnFilter[];
  mode: AdvancedSearchMode;
  onSubmit?: (filters: Filter[], search: string) => void;

  // Computed selectors
  getActiveTagId: () => string | null;

  // Actions - autocomplete
  setAutocompleteData: (data: AutocompleteCache) => void;

  // Actions - UI state
  setInputValue: (value: string) => void;
  setIsOpen: (isOpen: boolean) => void;
  setActiveIndex: (index: number) => void;
  setOpenSelectId: (id: string | null) => void;

  // Actions - tag operations
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
  updateTagValue: (tagId: string, value: string) => void;

  // Actions - selection
  selectAllTags: () => void;
  clearSelection: () => void;
  removeSelectedTags: (router: AppRouterInstance, pathname: string, searchParams: ReadonlyURLSearchParams) => void;

  // Actions - focus
  setTagFocusState: (tagId: string, state: FilterTagFocusState) => void;
  getTagFocusState: (tagId: string) => FilterTagFocusState;

  // Actions - submit/clear
  submit: (router: AppRouterInstance, pathname: string, searchParams: ReadonlyURLSearchParams) => void;
  clearAll: (router: AppRouterInstance, pathname: string, searchParams: ReadonlyURLSearchParams) => void;
  updateLastSubmitted: (filters: Filter[], search: string) => void;
}

const createAdvancedSearchStore = (
  filters: ColumnFilter[],
  initialTags: FilterTag[],
  initialSearch: string,
  mode: AdvancedSearchMode,
  onSubmit?: (filters: Filter[], search: string) => void,
  suggestions?: Map<string, string[]>
) => {
  // Track last submitted state to avoid redundant submits
  let lastSubmitted = {
    filters: initialTags.map(createFilterFromTag),
    search: initialSearch.trim(),
  };

  return createStore<AdvancedSearchStore>()((set, get) => ({
    // Initial state
    autocompleteData: suggestions || new Map(),
    tags: initialTags,
    inputValue: initialSearch,
    isOpen: false,
    activeIndex: -1,
    selectedTagIds: new Set<string>(),
    openSelectId: null,
    tagFocusStates: new Map<string, FilterTagFocusState>(),

    // Config
    filters,
    mode,
    onSubmit,

    // Computed selectors
    getActiveTagId: () => {
      const { tagFocusStates } = get();
      for (const [tagId, focusState] of tagFocusStates) {
        if (focusState.type !== "idle") return tagId;
      }
      return null;
    },

    // Autocomplete actions
    setAutocompleteData: (data) => set({ autocompleteData: data }),

    // UI state actions
    setInputValue: (value) => set({ inputValue: value, activeIndex: -1 }),
    setIsOpen: (isOpen) => set({ isOpen, activeIndex: -1 }),
    setActiveIndex: (activeIndex) => set({ activeIndex }),
    setOpenSelectId: (openSelectId) => set({ openSelectId }),

    // Tag operations
    setTags: (tags) => {
      set({ tags });
    },
    addTag: (field) => {
      const { filters } = get();
      const columnFilter = filters.find((f) => f.key === field);
      if (!columnFilter) return;

      const newTag: FilterTag = {
        id: `tag-${uniqueId()}`,
        field,
        operator: Operator.Eq,
        value: "",
      };

      set((state) => {
        const newFocusStates = new Map(state.tagFocusStates);
        newFocusStates.set(newTag.id, { type: "value", mode: "edit" });

        return {
          tags: [...state.tags, newTag],
          inputValue: "",
          isOpen: false,
          activeIndex: -1,
          tagFocusStates: newFocusStates,
        };
      });
    },

    addCompleteTag: (field, operator, value, router, pathname, searchParams) => {
      const { filters, onSubmit, mode } = get();
      const columnFilter = filters.find((f) => f.key === field);
      if (!columnFilter) return;

      const newTag: FilterTag = {
        id: `tag-${uniqueId()}`,
        field,
        operator,
        value,
      };

      const updatedTags = [...get().tags, newTag];
      const filterObjects = updatedTags.map(createFilterFromTag);
      const searchValue = "";

      lastSubmitted = { filters: filterObjects, search: searchValue };

      set({
        tags: updatedTags,
        inputValue: "",
        isOpen: false,
        activeIndex: -1,
      });

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
      set((state) => ({
        tags: state.tags.map((t) => (t.id === tagId ? { ...t, field } : t)),
      }));
    },

    updateTagOperator: (tagId, operator) => {
      set((state) => ({
        tags: state.tags.map((t) => (t.id === tagId ? { ...t, operator } : t)),
      }));
    },

    updateTagValue: (tagId, value) => {
      set((state) => ({
        tags: state.tags.map((t) => (t.id === tagId ? { ...t, value } : t)),
      }));
    },

    // Selection actions
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

    // Focus actions
    setTagFocusState: (tagId, focusState) => {
      set((state) => {
        const newFocusStates = new Map(state.tagFocusStates);
        newFocusStates.set(tagId, focusState);
        return { tagFocusStates: newFocusStates };
      });
    },

    getTagFocusState: (tagId) => get().tagFocusStates.get(tagId) || { type: "idle" },

    // Submit/clear actions
    submit: (router, pathname, searchParams) => {
      const { tags, inputValue, onSubmit, mode } = get();
      const filterObjects = tags.map(createFilterFromTag);
      const searchValue = inputValue.trim();

      if (isEqual(lastSubmitted.filters, filterObjects) && lastSubmitted.search === searchValue) {
        return;
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

      lastSubmitted = { filters: filterObjects, search: searchValue };

      onSubmit?.(filterObjects, searchValue);
    },

    clearAll: (router, pathname, searchParams) => {
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

      lastSubmitted = { filters: [], search: "" };

      onSubmit?.([], "");
    },
    updateLastSubmitted: (filters, search) => {
      lastSubmitted = { filters, search };
    },
  }));
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

// Provider
interface AdvancedSearchStoreProviderProps {
  filters: ColumnFilter[];
  mode?: AdvancedSearchMode;
  initialFilters?: Filter[];
  initialSearch?: string;
  onSubmit?: (filters: Filter[], search: string) => void;
  suggestions?: Map<string, string[]>;
}

export const AdvancedSearchStoreProvider = ({
  children,
  filters,
  mode = "url",
  initialFilters = [],
  initialSearch = "",
  onSubmit,
  suggestions,
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

  const storeRef = useRef<StoreApi<AdvancedSearchStore>>(null);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const tagHandlesRef = useRef<Map<string, FilterTagRef>>(new Map());

  if (!storeRef.current) {
    storeRef.current = createAdvancedSearchStore(filters, tags, search, mode, onSubmit, suggestions);
  }

  const refsValue = useMemo(() => ({ mainInputRef, tagHandlesRef }), []);

  return (
    <AdvancedSearchStoreContext.Provider value={storeRef.current}>
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
