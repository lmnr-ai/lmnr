"use client";

import { isEqual } from "lodash";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  Dispatch,
  PropsWithChildren,
  SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";

import {
  AutocompleteCache,
  ColumnFilter,
  createFilterFromTag,
  createTagFromFilter,
  FilterSearchContextValue,
  FilterSearchState,
  FilterTag,
  FilterTagFocusState,
  FilterTagRef,
  generateTagId,
  TagFocusPosition,
} from "./types";
import { getNextField, getPreviousField } from "./utils";

interface AutocompleteContextValue {
  data: AutocompleteCache;
  setData: Dispatch<SetStateAction<AutocompleteCache>>;
}

const AutocompleteContext = createContext<AutocompleteContextValue | null>(null);

export const useAutocompleteData = () => {
  const ctx = useContext(AutocompleteContext);
  if (!ctx) {
    throw new Error("useAutocompleteData must be used within AutocompleteProvider");
  }
  return ctx;
};

export const AutocompleteProvider = ({ children }: PropsWithChildren) => {
  const [data, setData] = useState<AutocompleteCache>(new Map());

  const value = useMemo(
    () => ({
      data,
      setData,
    }),
    [data, setData]
  );

  return <AutocompleteContext.Provider value={value}>{children}</AutocompleteContext.Provider>;
};

const FilterSearchContext = createContext<FilterSearchContextValue | null>(null);

export const useFilterSearch = () => {
  const ctx = useContext(FilterSearchContext);
  if (!ctx) {
    throw new Error("useFilterSearch must be used within FilterSearchProvider");
  }
  return ctx;
};

interface FilterSearchProviderProps {
  filters: ColumnFilter[];
  onSubmit?: (filters: Filter[], search: string) => void;
}

export const FilterSearchProvider = ({ filters, onSubmit, children }: PropsWithChildren<FilterSearchProviderProps>) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mainInputRef = useRef<HTMLInputElement>(null);
  const tagHandlesRef = useRef<Map<string, FilterTagRef>>(new Map());

  const initialState = useMemo((): FilterSearchState => {
    const rawSearch = searchParams.get("search") ?? "";
    const filterParams = searchParams.getAll("filter");
    const tags: FilterTag[] = filterParams.flatMap((f) => {
      try {
        const parsed = JSON.parse(f) as Filter;
        const columnFilter = filters.find((col) => col.key === parsed.column);
        if (columnFilter) {
          return [createTagFromFilter(parsed)];
        }
        return [];
      } catch {
        return [];
      }
    });

    return {
      tags,
      inputValue: rawSearch,
      isOpen: false,
      activeIndex: -1,
      selectedTagIds: new Set<string>(),
      openSelectId: null,
      tagFocusStates: new Map<string, FilterTagFocusState>(),
    };
  }, [searchParams, filters]);

  const [state, setState] = useState<FilterSearchState>(initialState);

  // Keep ref to always have current state for submit function
  const stateRef = useRef(state);
  stateRef.current = state;

  // Track last submitted state to avoid redundant submits
  const lastSubmittedRef = useRef<{ filters: Filter[]; search: string }>({
    filters: initialState.tags.map(createFilterFromTag),
    search: initialState.inputValue.trim(),
  });

  const activeTagId = useMemo(() => {
    for (const [tagId, focusState] of state.tagFocusStates) {
      if (focusState.type !== "idle") return tagId;
    }
    return null;
  }, [state.tagFocusStates]);

  const addTag = useCallback(
    (field: string) => {
      const columnFilter = filters.find((f) => f.key === field);
      if (!columnFilter) return;

      const newTag: FilterTag = {
        id: generateTagId(),
        field,
        operator: Operator.Eq,
        value: "",
      };

      setState((prev) => {
        const newFocusStates = new Map(prev.tagFocusStates);
        // Set focus state for the new tag - this will trigger auto-focus in the tag component
        newFocusStates.set(newTag.id, { type: "value", mode: "edit" });

        return {
          ...prev,
          tags: [...prev.tags, newTag],
          inputValue: "",
          isOpen: false,
          activeIndex: -1,
          tagFocusStates: newFocusStates,
        };
      });
    },
    [filters]
  );

  const addCompleteTag = useCallback(
    (field: string, operator: Operator, value: string) => {
      const columnFilter = filters.find((f) => f.key === field);
      if (!columnFilter) return;

      const newTag: FilterTag = {
        id: generateTagId(),
        field,
        operator,
        value,
      };

      let filterObjects: Filter[] = [];

      setState((prev) => {
        const updatedTags = [...prev.tags, newTag];
        filterObjects = updatedTags.map(createFilterFromTag);
        const searchValue = "";

        lastSubmittedRef.current = { filters: filterObjects, search: searchValue };

        return {
          ...prev,
          tags: updatedTags,
          inputValue: "",
          isOpen: false,
          activeIndex: -1,
        };
      });

      queueMicrotask(() => {
        const params = new URLSearchParams(searchParams.toString());

        params.delete("filter");
        params.delete("search");
        params.delete("pageNumber");
        params.set("pageNumber", "0");

        filterObjects.forEach((filter) => {
          params.append("filter", JSON.stringify(filter));
        });

        router.push(`${pathname}?${params.toString()}`);

        onSubmit?.(filterObjects, "");
      });

      return newTag;
    },
    [filters, searchParams, pathname, router, onSubmit]
  );

  const submit = useCallback(
    (explicitTags?: FilterTag[], explicitInputValue?: string) => {
      const tags = explicitTags !== undefined ? explicitTags : stateRef.current.tags;
      const inputValue = explicitInputValue !== undefined ? explicitInputValue : stateRef.current.inputValue;

      const filterObjects = tags.map(createFilterFromTag);
      const searchValue = inputValue.trim();

      if (isEqual(lastSubmittedRef.current.filters, filterObjects) && lastSubmittedRef.current.search === searchValue) {
        return;
      }

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

      lastSubmittedRef.current = { filters: filterObjects, search: searchValue };

      onSubmit?.(filterObjects, searchValue);
    },
    [searchParams, pathname, router, onSubmit]
  );

  const removeTag = useCallback(
    (tagId: string) => {
      let tagsToSubmit: FilterTag[] = [];
      let inputToSubmit = "";

      setState((prev) => {
        const newSelectedTagIds = new Set(prev.selectedTagIds);
        newSelectedTagIds.delete(tagId);
        const newFocusStates = new Map(prev.tagFocusStates);
        newFocusStates.delete(tagId);
        const newTags = prev.tags.filter((t) => t.id !== tagId);
        const newState = {
          ...prev,
          tags: newTags,
          selectedTagIds: newSelectedTagIds,
          tagFocusStates: newFocusStates,
        };
        stateRef.current = newState;

        tagsToSubmit = newTags;
        inputToSubmit = prev.inputValue;

        return newState;
      });

      queueMicrotask(() => {
        submit(tagsToSubmit, inputToSubmit);
      });
    },
    [submit]
  );

  const updateTagField = useCallback((tagId: string, field: string) => {
    setState((prev) => ({
      ...prev,
      tags: prev.tags.map((t) => (t.id === tagId ? { ...t, field } : t)),
    }));
  }, []);

  const updateTagOperator = useCallback((tagId: string, operator: Operator) => {
    setState((prev) => ({
      ...prev,
      tags: prev.tags.map((t) => (t.id === tagId ? { ...t, operator } : t)),
    }));
  }, []);

  const updateTagValue = useCallback((tagId: string, value: string) => {
    setState((prev) => {
      const newTags = prev.tags.map((t) => (t.id === tagId ? { ...t, value } : t));
      const newState = {
        ...prev,
        tags: newTags,
      };
      stateRef.current = newState;
      return newState;
    });
  }, []);

  const setInputValue = useCallback((value: string) => {
    setState((prev) => {
      const newState = { ...prev, inputValue: value, activeIndex: -1 };
      stateRef.current = newState;
      return newState;
    });
  }, []);

  const setIsOpen = useCallback((isOpen: boolean) => {
    setState((prev) => ({ ...prev, isOpen, activeIndex: -1 }));
  }, []);

  const setActiveIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, activeIndex: index }));
  }, []);

  const focusMainInput = useCallback(() => {
    setState((prev) => {
      // Clear all tag focus states
      const newFocusStates = new Map<string, FilterTagFocusState>();
      return { ...prev, tagFocusStates: newFocusStates };
    });
    mainInputRef.current?.focus();
  }, []);

  const selectAllTags = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedTagIds: new Set(prev.tags.map((t) => t.id)),
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedTagIds: new Set<string>(),
    }));
  }, []);

  const removeSelectedTags = useCallback(() => {
    let tagsToSubmit: FilterTag[] = [];
    let inputToSubmit = "";

    setState((prev) => {
      const newFocusStates = new Map(prev.tagFocusStates);
      prev.selectedTagIds.forEach((id) => newFocusStates.delete(id));
      const newTags = prev.tags.filter((t) => !prev.selectedTagIds.has(t.id));
      const newState = {
        ...prev,
        tags: newTags,
        selectedTagIds: new Set<string>(),
        tagFocusStates: newFocusStates,
      };
      stateRef.current = newState;

      tagsToSubmit = newTags;
      inputToSubmit = prev.inputValue;

      return newState;
    });

    queueMicrotask(() => {
      submit(tagsToSubmit, inputToSubmit);
    });
  }, [submit]);

  const setOpenSelectId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, openSelectId: id }));
  }, []);

  const setTagFocusState = useCallback((tagId: string, focusState: FilterTagFocusState) => {
    setState((prev) => {
      const newFocusStates = new Map(prev.tagFocusStates);
      newFocusStates.set(tagId, focusState);
      return { ...prev, tagFocusStates: newFocusStates };
    });
  }, []);

  const getTagFocusState = useCallback(
    (tagId: string): FilterTagFocusState => state.tagFocusStates.get(tagId) || { type: "idle" },
    [state.tagFocusStates]
  );

  // Navigation methods - moved from filter-search-input
  const navigateToTag = useCallback((tagId: string, position: TagFocusPosition) => {
    tagHandlesRef.current.get(tagId)?.focusPosition(position);
  }, []);

  const navigateToPreviousTag = useCallback(
    (currentTagId: string) => {
      const currentIndex = state.tags.findIndex((t) => t.id === currentTagId);
      if (currentIndex > 0) {
        const previousTag = state.tags[currentIndex - 1];
        navigateToTag(previousTag.id, "remove");
      }
    },
    [state.tags, navigateToTag]
  );

  const navigateToNextTag = useCallback(
    (currentTagId: string) => {
      const currentIndex = state.tags.findIndex((t) => t.id === currentTagId);
      if (currentIndex >= 0 && currentIndex < state.tags.length - 1) {
        const nextTag = state.tags[currentIndex + 1];
        navigateToTag(nextTag.id, "field");
      } else if (currentIndex === state.tags.length - 1) {
        focusMainInput();
      }
    },
    [state.tags, navigateToTag, focusMainInput]
  );

  const registerTagHandle = useCallback((tagId: string, handle: FilterTagRef | null) => {
    if (handle) {
      tagHandlesRef.current.set(tagId, handle);
    } else {
      tagHandlesRef.current.delete(tagId);
    }
  }, []);

  const navigateWithinTag = useCallback(
    (tagId: string, direction: "left" | "right") => {
      const focusState = state.tagFocusStates.get(tagId);
      if (!focusState || focusState.type === "idle") return;

      const currentType = focusState.type;
      const targetField = direction === "left" ? getPreviousField(currentType) : getNextField(currentType);

      if (targetField) {
        // Navigate within same tag - use focusPosition to properly focus container
        tagHandlesRef.current.get(tagId)?.focusPosition(targetField);
      } else {
        // Navigate to adjacent tag
        if (direction === "left") {
          navigateToPreviousTag(tagId);
        } else {
          navigateToNextTag(tagId);
        }
      }
    },
    [state.tagFocusStates, navigateToPreviousTag, navigateToNextTag]
  );

  const clearAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      tags: [],
      inputValue: "",
      selectedTagIds: new Set<string>(),
      isOpen: false,
      tagFocusStates: new Map<string, FilterTagFocusState>(),
    }));

    // Submit with empty state
    const params = new URLSearchParams(searchParams.toString());
    params.delete("filter");
    params.delete("search");
    params.delete("pageNumber");
    params.set("pageNumber", "0");
    router.push(`${pathname}?${params.toString()}`);

    // Update last submitted state
    lastSubmittedRef.current = { filters: [], search: "" };

    onSubmit?.([], "");

    // Blur the input
    mainInputRef.current?.blur();
  }, [searchParams, pathname, router, onSubmit, mainInputRef]);

  const value = useMemo<FilterSearchContextValue>(
    () => ({
      state,
      filters,
      activeTagId,
      addTag,
      addCompleteTag,
      removeTag,
      updateTagField,
      updateTagOperator,
      updateTagValue,
      setInputValue,
      setIsOpen,
      setActiveIndex,
      mainInputRef,
      submit,
      clearAll,
      focusMainInput,
      selectAllTags,
      clearSelection,
      removeSelectedTags,
      setOpenSelectId,
      setTagFocusState,
      getTagFocusState,
      navigateWithinTag,
      navigateToTag,
      registerTagHandle,
    }),
    [
      state,
      filters,
      activeTagId,
      addTag,
      addCompleteTag,
      removeTag,
      updateTagField,
      updateTagOperator,
      updateTagValue,
      setInputValue,
      setIsOpen,
      setActiveIndex,
      submit,
      clearAll,
      focusMainInput,
      selectAllTags,
      clearSelection,
      removeSelectedTags,
      setOpenSelectId,
      setTagFocusState,
      getTagFocusState,
      navigateWithinTag,
      navigateToTag,
      registerTagHandle,
    ]
  );

  return <FilterSearchContext.Provider value={value}>{children}</FilterSearchContext.Provider>;
};
