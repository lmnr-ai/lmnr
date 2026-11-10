import { formatDuration } from "@/lib/utils";

export const formatMs = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) return "–";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  return formatDuration(ms) ?? "–";
};
