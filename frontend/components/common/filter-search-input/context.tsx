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
  ColumnFilter,
  createFilterFromTag,
  createTagFromFilter,
  FilterSearchContextValue,
  FilterSearchState,
  FilterTag,
  generateTagId,
} from "./types";

interface StatefulFilterContextValue {
  filters: Filter[];
  setFilters: Dispatch<SetStateAction<Filter[]>>;
}

const StatefulFilterContext = createContext<StatefulFilterContextValue | null>(null);

export const useStatefulFilters = () => {
  const ctx = useContext(StatefulFilterContext);
  if (!ctx) {
    throw new Error("useStatefulFilters must be used within StatefulFilterProvider");
  }
  return ctx;
};

export const StatefulFilterProvider = ({
  initialFilters = [],
  children,
}: PropsWithChildren<{ initialFilters?: Filter[] }>) => {
  const [filters, setFilters] = useState<Filter[]>(initialFilters);

  const value = useMemo(() => ({ filters, setFilters }), [filters]);

  return <StatefulFilterContext.Provider value={value}>{children}</StatefulFilterContext.Provider>;
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
  mode: "url" | "stateful";
  additionalSearchParams?: Record<string, string | string[]>;
  onSubmit?: (filters: Filter[], search: string) => void;
}

export const FilterSearchProvider = ({
  filters,
  mode,
  additionalSearchParams = {},
  onSubmit,
  children,
}: PropsWithChildren<FilterSearchProviderProps>) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mainInputRef = useRef<HTMLInputElement>(null);

  // Always call useContext unconditionally (React hooks rule)
  const statefulCtxValue = useContext(StatefulFilterContext);
  const statefulCtx = mode === "stateful" ? statefulCtxValue : null;

  const initialState = useMemo((): FilterSearchState => {
    if (mode === "url") {
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
      };
    }

    // Stateful mode
    const statefulFilters = statefulCtx?.filters ?? [];
    const tags = statefulFilters.map(createTagFromFilter);
    return {
      tags,
      inputValue: "",
      activeTagId: null,
      isOpen: false,
      activeIndex: 0,
      isAddingTag: false,
      selectedTagIds: new Set<string>(),
    };
  }, []);

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
        isAddingTag: true, // Flag to prevent submit on blur
      }));
    },
    [filters]
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

  const submit = useCallback(() => {
    const filterObjects = state.tags.map(createFilterFromTag);
    const searchValue = state.inputValue.trim();

    if (mode === "url") {
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

      // Apply additional search params
      Object.entries(additionalSearchParams).forEach(([key, val]) => {
        params.delete(key);
        if (Array.isArray(val)) {
          val.forEach((v) => params.append(key, v));
        } else {
          params.set(key, val);
        }
      });

      router.push(`${pathname}?${params.toString()}`);
    } else if (mode === "stateful" && statefulCtx) {
      statefulCtx.setFilters(filterObjects);
    }

    onSubmit?.(filterObjects, searchValue);
  }, [state.tags, state.inputValue, mode, searchParams, pathname, router, statefulCtx, onSubmit, additionalSearchParams]);

  const value = useMemo<FilterSearchContextValue>(
    () => ({
      state,
      filters,
      addTag,
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
      focusMainInput,
      selectAllTags,
      clearSelection,
      removeSelectedTags,
    }),
    [
      state,
      filters,
      addTag,
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
      focusMainInput,
      selectAllTags,
      clearSelection,
      removeSelectedTags,
    ]
  );

  return <FilterSearchContext.Provider value={value}>{children}</FilterSearchContext.Provider>;
};
