import { RefObject } from "react";

import { ColumnFilter, dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";

export type { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

// Autocomplete cache types
export type AutocompleteCache = Map<string, string[]>;

// Shared ref types for focus management
export interface FocusableRef {
  focus: () => void;
}

export interface FilterTagRef {
  focusPosition: (position: TagFocusPosition) => void;
}

export interface FilterTag {
  id: string;
  field: string;
  operator: Operator;
  value: string;
}

// Focus position within a tag: field -> operator -> value -> remove
export type TagFocusPosition = "field" | "operator" | "value" | "remove";

// Focus mode for two-level focus system
export type FocusMode = "nav" | "edit";

// Focus state machine for FilterTag with two-level focus
export type FilterTagFocusState =
  | { type: "idle" }
  | { type: "field"; mode: FocusMode }
  | { type: "operator"; mode: FocusMode }
  | { type: "value"; mode: FocusMode }
  | { type: "remove"; mode: FocusMode };

export interface FilterSearchState {
  tags: FilterTag[];
  inputValue: string;
  isOpen: boolean;
  activeIndex: number; // For keyboard navigation in suggestions
  selectedTagIds: Set<string>; // For bulk selection with Cmd+A
  openSelectId: string | null;
  tagFocusStates: Map<string, FilterTagFocusState>; // Per-tag focus state
}

export interface FilterSearchContextValue {
  // State
  state: FilterSearchState;
  filters: ColumnFilter[];

  // Tag operations
  addTag: (field: string) => void;
  addCompleteTag: (field: string, operator: Operator, value: string) => FilterTag | undefined;
  removeTag: (tagId: string) => void;
  updateTagField: (tagId: string, field: string) => void;
  updateTagOperator: (tagId: string, operator: Operator) => void;
  updateTagValue: (tagId: string, value: string) => void;

  // Derived state
  activeTagId: string | null;

  // Input operations
  setInputValue: (value: string) => void;
  setIsOpen: (isOpen: boolean) => void;
  setActiveIndex: (index: number) => void;

  // Refs
  mainInputRef: RefObject<HTMLInputElement | null>;

  // Submit
  submit: () => void;
  clearAll: () => void;

  // Navigation
  focusMainInput: () => void;
  navigateToTag: (tagId: string, position: TagFocusPosition) => void;
  registerTagHandle: (tagId: string, handle: FilterTagRef | null) => void;

  // Selection
  selectAllTags: () => void;
  clearSelection: () => void;
  removeSelectedTags: () => void;

  setOpenSelectId: (id: string | null) => void;

  // Tag focus state management
  setTagFocusState: (tagId: string, state: FilterTagFocusState) => void;
  getTagFocusState: (tagId: string) => FilterTagFocusState;

  // Within-tag navigation (handles focus properly)
  navigateWithinTag: (tagId: string, direction: "left" | "right") => void;
}

export function createFilterFromTag(tag: FilterTag): Filter {
  return {
    column: tag.field,
    operator: tag.operator,
    value: tag.value,
  };
}

export function createTagFromFilter(filter: Filter): FilterTag {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    field: filter.column,
    operator: filter.operator,
    value: String(filter.value),
  };
}

export function generateTagId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getOperationsForField(filters: ColumnFilter[], field: string) {
  const columnFilter = filters.find((f) => f.key === field);
  if (!columnFilter) return dataTypeOperationsMap.string;
  return dataTypeOperationsMap[columnFilter.dataType];
}

export function getColumnFilter(filters: ColumnFilter[], field: string): ColumnFilter | undefined {
  return filters.find((f) => f.key === field);
}
