import { isNil, isObject } from "lodash";

export const stringifyCellValue = (value: unknown): string => {
  if (isNil(value)) return "NULL";
  if (isObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "[Object]";
    }
  }
  return String(value);
};

export const loadStoredSizing = (storageKey: string): Record<string, number> => {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
