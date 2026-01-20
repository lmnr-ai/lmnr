import { uniqueId } from "lodash";

import { type ColumnFilter, dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { type Operator } from "@/lib/actions/common/operators";

export type { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export type AdvancedSearchMode = "url" | "state";

export type AutocompleteCache = Map<string, string[]>;

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

export type TagFocusPosition = "field" | "operator" | "value" | "remove";

export type FocusMode = "nav" | "edit";

export type FilterTagFocusState =
  | { type: "idle" }
  | { type: "field"; mode: FocusMode }
  | { type: "operator"; mode: FocusMode }
  | { type: "value"; mode: FocusMode }
  | { type: "remove"; mode: FocusMode };

export function createFilterFromTag(tag: FilterTag): Filter {
  return {
    column: tag.field,
    operator: tag.operator,
    value: tag.value,
  };
}

export function createTagFromFilter(filter: Filter): FilterTag {
  return {
    id: `tag-${uniqueId()}`,
    field: filter.column,
    operator: filter.operator,
    value: String(filter.value),
  };
}

export function getOperationsForField(filters: ColumnFilter[], field: string) {
  const columnFilter = filters.find((f) => f.key === field);
  if (!columnFilter) return dataTypeOperationsMap.string;
  return dataTypeOperationsMap[columnFilter.dataType];
}

export function getColumnFilter(filters: ColumnFilter[], field: string): ColumnFilter | undefined {
  return filters.find((f) => f.key === field);
}
