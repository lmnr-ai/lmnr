export type ModelTestStatus =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; latencyMs: number }
  | { state: "error"; error: string };

export const STATUS_ICON_SIZE = 14;
