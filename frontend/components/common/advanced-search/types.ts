import { uniqueId } from "lodash";

import { type ColumnFilter, getColumnOperations } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter, type FilterDataType } from "@/lib/actions/common/filters";
import { type Operator } from "@/lib/actions/common/operators";

export type { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export interface AdvancedSearchValue {
  filters: Filter[];
  search: string;
}

export type AdvancedSearchResource = "traces" | "spans" | "sessions" | "signal-events" | "signal-runs";

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
  dataType?: FilterDataType;
  operator: Operator;
  value: string | string[];
}

export type TagFocusPosition = "field" | "operator" | "value" | "remove";

export type FocusMode = "nav" | "edit";

// "nav": part highlighted for arrow keys; "edit": its control is open for input.
export interface TagFocus {
  tagId: string;
  position: TagFocusPosition;
  mode: FocusMode;
}

export function createFilterFromTag(tag: FilterTag): Filter {
  return {
    ...(tag.dataType && { dataType: tag.dataType }),
    column: tag.field,
    operator: tag.operator,
    value: tag.value,
  } as Filter;
}

export function createTagFromFilter(filter: Filter): FilterTag {
  return {
    id: `tag-${uniqueId()}`,
    field: filter.column,
    dataType: filter.dataType,
    operator: filter.operator,
    // Preserve array values directly, stringify others
    value: Array.isArray(filter.value) ? filter.value : String(filter.value),
  };
}

export function getOperationsForField(
  filters: ColumnFilter[],
  field: string,
  fallbackDataType: FilterDataType = "string"
) {
  return getColumnOperations(
    filters.find((f) => f.key === field),
    fallbackDataType
  );
}

export function getColumnFilter(filters: ColumnFilter[], field: string): ColumnFilter | undefined {
  return filters.find((f) => f.key === field);
}

const isCompleteTag = (tag: FilterTag) => (Array.isArray(tag.value) ? tag.value.length > 0 : tag.value !== "");

// Tags without a value are mid-edit and never ship.
export const valueFromTags = (tags: FilterTag[], search: string): AdvancedSearchValue => ({
  filters: tags.filter(isCompleteTag).map(createFilterFromTag),
  search: search.trim(),
});

// Round-trips through tags so external values (e.g. numbers) compare equal to committed ones.
export const normalizeValue = (value: AdvancedSearchValue): AdvancedSearchValue =>
  valueFromTags(value.filters.map(createTagFromFilter), value.search);
