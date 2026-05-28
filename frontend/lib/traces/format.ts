const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

export const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 5,
  minimumFractionDigits: 1,
});

export const detailedCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 8,
});

// No `$` — paired with a CircleDollarSign icon in shields.
const costNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 5,
  minimumFractionDigits: 1,
});

export function formatCostNumber(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "-";
  return costNumberFormatter.format(n);
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms) || ms < 0) return "-";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(2)}s`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const totalMinutes = Math.floor(seconds / 60);
  const remainderSeconds = Math.round(seconds - totalMinutes * 60);
  if (totalMinutes < 60) {
    return remainderSeconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m ${remainderSeconds}s`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainderMinutes = totalMinutes - totalHours * 60;
  if (totalHours < 24) {
    return remainderMinutes === 0 ? `${totalHours}h` : `${totalHours}h ${remainderMinutes}m`;
  }

  const days = Math.floor(totalHours / 24);
  const remainderHours = totalHours - days * 24;
  return remainderHours === 0 ? `${days}d` : `${days}d ${remainderHours}h`;
}

export function formatDurationExact(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms) || ms < 0) return "-";
  return `${fullNumberFormatter.format(ms)} ms`;
}

export function durationMsBetween(startTime: string | undefined, endTime: string | undefined): number | null {
  if (!startTime || !endTime) return null;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (!isFinite(start) || !isFinite(end) || end < start) return null;
  return end - start;
}

export function formatTokensCompact(n: number | null | undefined): string {
  if (n == null) return "-";
  return compactNumberFormatter.format(n);
}

export function formatTokensFull(n: number | null | undefined): string {
  if (n == null) return "-";
  return fullNumberFormatter.format(n);
}

// Subset shapes shared by TraceRow / SpanRow / SessionRow.
export interface TokenStats {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  cacheReadInputTokens?: number | null;
  reasoningTokens?: number | null;
}

export interface CostStats {
  inputCost?: number | null;
  outputCost?: number | null;
  totalCost?: number | null;
}
