"use client";

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

// Autocomplete Context
interface AutocompleteContextValue {
  autocompleteData: AutocompleteCache;
  setAutocompleteData: Dispatch<SetStateAction<AutocompleteCache>>;
  isAutocompleteLoading: boolean;
  setIsAutocompleteLoading: Dispatch<SetStateAction<boolean>>;
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
  const [autocompleteData, setAutocompleteData] = useState<AutocompleteCache>(new Map());
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);

  const value = useMemo(
    () => ({
      autocompleteData,
      setAutocompleteData,
      isAutocompleteLoading,
      setIsAutocompleteLoading,
    }),
    [autocompleteData, isAutocompleteLoading]
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

export const FilterSearchProvider = ({
  filters,
  onSubmit,
  children,
}: PropsWithChildren<FilterSearchProviderProps>) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mainInputRef = useRef<HTMLInputElement>(null);
  const tagHandlesRef = useRef<Map<string, FilterTagRef>>(new Map());

  // Get autocomplete data from context
  const autocompleteCtx = useContext(AutocompleteContext);
  const autocompleteData = autocompleteCtx?.autocompleteData ?? new Map();
  const isAutocompleteLoading = autocompleteCtx?.isAutocompleteLoading ?? false;

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
      activeTagId: null,
      isOpen: false,
      activeIndex: 0,
      isAddingTag: false,
      selectedTagIds: new Set<string>(),
      openSelectId: null,
      tagFocusStates: new Map<string, FilterTagFocusState>(),
    };
  }, [searchParams, filters]);

  const [state, setState] = useState<FilterSearchState>(initialState);

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

      setState((prev) => ({
        ...prev,
        tags: [...prev.tags, newTag],
        inputValue: "",
        activeTagId: newTag.id,
        isOpen: false,
        activeIndex: 0,
        isAddingTag: true,
      }));
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

      setState((prev) => {
        const updatedTags = [...prev.tags, newTag];
        const filterObjects = updatedTags.map(createFilterFromTag);
        const searchValue = "";

        // Submit immediately with the new tags
        const params = new URLSearchParams(searchParams.toString());

        // Clear existing filters and search
        params.delete("filter");
        params.delete("search");
        params.delete("pageNumber");
        params.set("pageNumber", "0");

        // Add filter tags
        filterObjects.forEach((filter) => {
          params.append("filter", JSON.stringify(filter));
        });

        router.push(`${pathname}?${params.toString()}`);

        onSubmit?.(filterObjects, searchValue);

        return {
          ...prev,
          tags: updatedTags,
          inputValue: "",
          activeTagId: null,
          isOpen: false,
          activeIndex: 0,
          isAddingTag: false,
        };
      });

      return newTag;
    },
    [filters, searchParams, pathname, router, onSubmit]
  );

  const removeTag = useCallback((tagId: string) => {
    setState((prev) => {
      const newSelectedTagIds = new Set(prev.selectedTagIds);
      newSelectedTagIds.delete(tagId);
      return {
        ...prev,
        tags: prev.tags.filter((t) => t.id !== tagId),
        activeTagId: prev.activeTagId === tagId ? null : prev.activeTagId,
        selectedTagIds: newSelectedTagIds,
      };
    });
  }, []);

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
    setState((prev) => ({
      ...prev,
      tags: prev.tags.map((t) => (t.id === tagId ? { ...t, value } : t)),
    }));
  }, []);

  const setInputValue = useCallback((value: string) => {
    setState((prev) => ({ ...prev, inputValue: value, activeIndex: 0 }));
  }, []);

  const setActiveTagId = useCallback((tagId: string | null) => {
    setState((prev) => ({ ...prev, activeTagId: tagId }));
  }, []);

  const setIsOpen = useCallback((isOpen: boolean) => {
    setState((prev) => ({ ...prev, isOpen, activeIndex: 0 }));
  }, []);

  const setActiveIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, activeIndex: index }));
  }, []);

  const setIsAddingTag = useCallback((isAdding: boolean) => {
    setState((prev) => ({ ...prev, isAddingTag: isAdding }));
  }, []);

  const focusMainInput = useCallback(() => {
    setState((prev) => ({ ...prev, activeTagId: null }));
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
    setState((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => !prev.selectedTagIds.has(t.id)),
      selectedTagIds: new Set<string>(),
      activeTagId: null,
    }));
  }, []);

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

  const submit = useCallback(() => {
    const filterObjects = state.tags.map(createFilterFromTag);
    const searchValue = state.inputValue.trim();

    const params = new URLSearchParams(searchParams.toString());

    // Clear existing filters and search
    params.delete("filter");
    params.delete("search");
    params.delete("pageNumber");
    params.set("pageNumber", "0");

    // Add filter tags
    filterObjects.forEach((filter) => {
      params.append("filter", JSON.stringify(filter));
    });

    // Add raw search if present
    if (searchValue) {
      params.set("search", searchValue);
    }

    router.push(`${pathname}?${params.toString()}`);

    onSubmit?.(filterObjects, searchValue);
  }, [state.tags, state.inputValue, searchParams, pathname, router, onSubmit]);

  const clearAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      tags: [],
      inputValue: "",
      selectedTagIds: new Set<string>(),
      activeTagId: null,
      isOpen: false,
    }));

    // Submit with empty state
    const params = new URLSearchParams(searchParams.toString());
    params.delete("filter");
    params.delete("search");
    params.delete("pageNumber");
    params.set("pageNumber", "0");
    router.push(`${pathname}?${params.toString()}`);

    onSubmit?.([], "");

    // Blur the input
    mainInputRef.current?.blur();
  }, [searchParams, pathname, router, onSubmit, mainInputRef]);

  const value = useMemo<FilterSearchContextValue>(
    () => ({
      state,
      filters,
      addTag,
      addCompleteTag,
      removeTag,
      updateTagField,
      updateTagOperator,
      updateTagValue,
      setInputValue,
      setActiveTagId,
      setIsOpen,
      setActiveIndex,
      setIsAddingTag,
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
      autocompleteData,
      isAutocompleteLoading,
      navigateToTag,
      navigateToPreviousTag,
      navigateToNextTag,
      registerTagHandle,
    }),
    [
      state,
      filters,
      addTag,
      addCompleteTag,
      removeTag,
      updateTagField,
      updateTagOperator,
      updateTagValue,
      setInputValue,
      setActiveTagId,
      setIsOpen,
      setActiveIndex,
      setIsAddingTag,
      submit,
      clearAll,
      focusMainInput,
      selectAllTags,
      clearSelection,
      removeSelectedTags,
      setOpenSelectId,
      setTagFocusState,
      getTagFocusState,
      autocompleteData,
      isAutocompleteLoading,
      navigateToTag,
      navigateToPreviousTag,
      navigateToNextTag,
      registerTagHandle,
    ]
  );

  return <FilterSearchContext.Provider value={value}>{children}</FilterSearchContext.Provider>;
};
