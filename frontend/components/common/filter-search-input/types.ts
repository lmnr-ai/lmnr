import { RefObject } from "react";

import { ColumnFilter, dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";

export type { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export interface FilterTag {
  id: string;
  field: string;
  operator: Operator;
  value: string;
}

// Focus position within a tag: field -> operator -> value -> remove
export type TagFocusPosition = "field" | "operator" | "value" | "remove";

export interface FocusedTag {
  tagId: string;
  position: TagFocusPosition;
}

export interface FilterSearchState {
  tags: FilterTag[];
  inputValue: string;
  activeTagId: string | null;
  isOpen: boolean;
  activeIndex: number; // For keyboard navigation in suggestions
  focusedTag: FocusedTag | null; // For keyboard navigation between tags
  isAddingTag: boolean; // Prevent submit when adding a tag
}

export interface FilterSearchContextValue {
  // State
  state: FilterSearchState;
  filters: ColumnFilter[];

  // Tag operations
  addTag: (field: string) => void;
  removeTag: (tagId: string) => void;
  updateTagOperator: (tagId: string, operator: Operator) => void;
  updateTagValue: (tagId: string, value: string) => void;

  // Input operations
  setInputValue: (value: string) => void;
  setActiveTagId: (tagId: string | null) => void;
  setIsOpen: (isOpen: boolean) => void;
  setActiveIndex: (index: number) => void;
  setFocusedTag: (focusedTag: FocusedTag | null) => void;
  setIsAddingTag: (isAdding: boolean) => void;

  // Refs
  mainInputRef: RefObject<HTMLInputElement | null>;
  tagRefs: RefObject<Map<string, HTMLDivElement>>;

  // Submit
  submit: () => void;

  // Navigation
  focusMainInput: () => void;
  focusTagAtPosition: (tagId: string, position: TagFocusPosition) => void;
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
