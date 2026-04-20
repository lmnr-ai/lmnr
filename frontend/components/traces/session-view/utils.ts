import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TranscriptListEntry,
  type TranscriptListGroup,
} from "@/components/traces/trace-view/store/base";
import { buildTranscriptListEntries, toLightweight } from "@/components/traces/trace-view/store/utils";
import { type SessionSpansTraceResult } from "@/lib/actions/sessions/search-spans";
import { type TraceRow } from "@/lib/traces/types";

export const spanToListSpan = toLightweight;

/** Transform a trace's spans into transcript-mode entries. Uses the upstream
 *  buildTranscriptListEntries which handles subagent detection automatically. */
export function computeTranscriptEntries(spans: TraceViewSpan[]): TranscriptListEntry[] {
  // Session view doesn't use condensed timeline selection, so pass empty set
  return buildTranscriptListEntries(spans, new Set());
}

// ---------- Flat row synthesis ----------

export type SessionFlatRow =
  | { type: "trace-header"; trace: TraceRow; expanded: boolean }
  | { type: "trace-loading"; traceId: string }
  | { type: "trace-error"; traceId: string; error: string }
  | { type: "trace-empty"; traceId: string }
  | { type: "user-input"; traceId: string }
  | { type: "span"; traceId: string; span: TraceViewListSpan }
  | { type: "group-header"; traceId: string; group: TranscriptListGroup; collapsed: boolean }
  | { type: "group-span"; traceId: string; span: TraceViewListSpan; isLast: boolean }
  | { type: "trace-collapsed-end"; traceId: string; gapMs?: number }
  | { type: "trace-expanded-end"; traceId: string; gapMs?: number };

/** Format an inter-trace gap in ms as a short human-readable string.
 *  Returns null for zero/negative/invalid gaps — callers should render
 *  just a divider line in that case. */
export function formatGap(ms: number | undefined): string | null {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return null;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const s = seconds % 60;
    return s === 0 ? `${minutes}m` : `${minutes}m ${s}s`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const m = minutes % 60;
    return m === 0 ? `${hours}h` : `${hours}h ${m}m`;
  }
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h === 0 ? `${days}d` : `${days}d ${h}h`;
}

interface BuildFlatRowsOpts {
  traces: TraceRow[];
  traceSpans: Record<string, TraceViewSpan[]>;
  traceSpansLoading: Record<string, boolean>;
  traceSpansError: Record<string, string | undefined>;
  expandedTraceIds: Set<string>;
  /** Namespaced `${traceId}::${groupId}` set of EXPANDED groups (default collapsed). */
  transcriptExpandedGroups: Set<string>;
  /** When set, a search is active: only matched traces appear, always expanded,
   *  with only matching spans (flat, no transcript-mode groups). */
  searchResults?: Record<string, SessionSpansTraceResult>;
}

/** Build the hybrid (trace headers + spans) flat row list that drives the
 *  session panel virtualizer. */
export function buildSessionFlatRows(opts: BuildFlatRowsOpts): SessionFlatRow[] {
  const {
    traces,
    traceSpans,
    traceSpansLoading,
    traceSpansError,
    expandedTraceIds,
    transcriptExpandedGroups,
    searchResults,
  } = opts;

  // --- Search mode: only matched traces, always expanded, flat spans ---
  if (searchResults) {
    return buildSearchFlatRows(traces, searchResults);
  }

  // --- Normal mode ---
  const rows: SessionFlatRow[] = [];

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    const nextTrace = traces[i + 1];
    const gapMs = nextTrace ? new Date(nextTrace.startTime).getTime() - new Date(trace.endTime).getTime() : undefined;
    const expanded = expandedTraceIds.has(trace.id);
    rows.push({ type: "trace-header", trace, expanded });

    if (!expanded) {
      rows.push({ type: "trace-collapsed-end", traceId: trace.id, gapMs });
      continue;
    }

    const error = traceSpansError[trace.id];
    if (error) {
      rows.push({ type: "trace-error", traceId: trace.id, error });
      rows.push({ type: "trace-expanded-end", traceId: trace.id, gapMs });
      continue;
    }

    const loading = traceSpansLoading[trace.id];
    const spans = traceSpans[trace.id];
    if ((loading && !spans) || !spans) {
      rows.push({ type: "trace-loading", traceId: trace.id });
      rows.push({ type: "trace-expanded-end", traceId: trace.id, gapMs });
      continue;
    }

    if (spans.length === 0) {
      rows.push({ type: "trace-empty", traceId: trace.id });
      rows.push({ type: "trace-expanded-end", traceId: trace.id, gapMs });
      continue;
    }

    rows.push({ type: "user-input", traceId: trace.id });

    const entries = computeTranscriptEntries(spans);
    for (const entry of entries) {
      if (entry.type === "span") {
        rows.push({ type: "span", traceId: trace.id, span: entry.span });
      } else if (entry.type === "group") {
        const nsKey = `${trace.id}::${entry.groupId}`;
        const collapsed = !transcriptExpandedGroups.has(nsKey);
        rows.push({ type: "group-header", traceId: trace.id, group: entry, collapsed });
        if (!collapsed) {
          // Flatten group-span and group-input children
          const childEntries = entries.filter(
            (e) => (e.type === "group-span" || e.type === "group-input") && e.groupId === entry.groupId
          );
          for (let i = 0; i < childEntries.length; i++) {
            const child = childEntries[i];
            if (child.type === "group-span") {
              rows.push({
                type: "group-span",
                traceId: trace.id,
                span: child.span,
                isLast: i === childEntries.length - 1,
              });
            }
          }
        }
      }
    }

    rows.push({ type: "trace-expanded-end", traceId: trace.id, gapMs });
  }

  return rows;
}

function buildSearchFlatRows(
  traces: TraceRow[],
  searchResults: Record<string, SessionSpansTraceResult>
): SessionFlatRow[] {
  const rows: SessionFlatRow[] = [];

  for (const trace of traces) {
    const result = searchResults[trace.id];
    if (!result || result.spans.length === 0) continue;

    rows.push({ type: "trace-header", trace, expanded: true });

    for (const span of result.spans) {
      if (span.spanType === "DEFAULT") continue;
      rows.push({
        type: "span",
        traceId: trace.id,
        span: spanToListSpan(span),
      });
    }

    rows.push({ type: "trace-expanded-end", traceId: trace.id });
  }

  return rows;
}
