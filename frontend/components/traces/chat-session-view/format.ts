import { formatDuration } from "@/lib/utils";

export const durationMs = (start: string, end: string) => new Date(end).getTime() - new Date(start).getTime();

export const formatMs = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) return "–";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  return formatDuration(ms) ?? "–";
};

export const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;

export const formatCost = (c: number) => (c > 0 ? `$${c < 0.01 ? c.toFixed(4) : c.toFixed(2)}` : null);
