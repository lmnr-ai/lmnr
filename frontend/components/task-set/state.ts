import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";

export const TABS = ["tasks", "versions", "runs", "scripts"] as const;
export type TaskSetTab = (typeof TABS)[number];

export const useTaskSetTab = () => useQueryState("tab", parseAsStringLiteral(TABS).withDefault("tasks"));

/** `?version=`: the version the Tasks tab shows; the head when unset. */
export const useVersionParam = () => useQueryState("version", parseAsString);

/** `?task=`: the task open in the Tasks tab. */
export const useTaskParam = () => useQueryState("task", parseAsString);
