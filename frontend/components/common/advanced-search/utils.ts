import { FilterTagFocusState, TagFocusPosition } from "@/components/common/advanced-search/types.ts";

const FIELD_ORDER: TagFocusPosition[] = ["field", "operator", "value", "remove"];

export const getNextField = (current: TagFocusPosition): TagFocusPosition | null => {
  const index = FIELD_ORDER.indexOf(current);
  return index < FIELD_ORDER.length - 1 ? FIELD_ORDER[index + 1] : null;
};
export const getPreviousField = (current: TagFocusPosition): TagFocusPosition | null => {
  const index = FIELD_ORDER.indexOf(current);
  return index > 0 ? FIELD_ORDER[index - 1] : null;
};

export const createEditFocusState = (type: TagFocusPosition, _openDropdown = false): FilterTagFocusState => ({ type, mode: "edit" });
