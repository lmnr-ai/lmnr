/** What the panel under the trace shows: the task's files or the trial's Harbor output. */
export const PANELS = ["task", "log"] as const;
export type Panel = (typeof PANELS)[number];

export const PANEL_LABELS: Record<Panel, string> = { task: "Task", log: "Logs" };
