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
export const createNavFocusState = (type: TagFocusPosition): FilterTagFocusState => {
  switch (type) {
    case "field":
    case "operator":
      return { type, mode: "nav", isOpen: false };
    case "value":
      return { type, mode: "nav", showSuggestions: false, isSelectOpen: false };
    case "remove":
      return { type, mode: "nav" };
  }
};
export const createEditFocusState = (type: TagFocusPosition, openDropdown = false): FilterTagFocusState => {
  switch (type) {
    case "field":
    case "operator":
      return { type, mode: "edit", isOpen: openDropdown };
    case "value":
      return { type, mode: "edit", showSuggestions: false, isSelectOpen: false };
    case "remove":
      return { type, mode: "edit" };
  }
};
