import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import {
  type BaseSessionViewStore,
  createBaseSessionViewSlice,
  SessionViewContext,
} from "@/components/traces/session-view/store/base";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import { type SessionBlock } from "@/lib/actions/debugger-sessions";
import { toast } from "@/lib/hooks/use-toast";
import { type RealtimeSpan, type SpanType, type TraceRow } from "@/lib/traces/types";

/**
 * Client view of a session block — same shape as the server `SessionBlock`:
 * trace blocks reference their trace by id; the trace row itself lives in the
 * base store's `traces` (so span streaming / expand machinery is shared with
 * the regular session view) and is batch-loaded lazily as blocks scroll into
 * view (`ensureTraceRows`). Blocks are the single ordered source for the
 * timeline; ordering is `createdAt` (entity time, frozen at ingest). Notes are
 * standalone `text` blocks only — trace blocks carry none.
 */
export type SessionBlockView = SessionBlock;

const sortBlocks = (blocks: SessionBlockView[]): SessionBlockView[] =>
  [...blocks].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

// Normalize metadata (object OR JSON string) into TraceRow's Record<string,string>.
const normalizeMetadata = (metadata: unknown): Record<string, string> => {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, typeof v === "string" ? v : String(v)]));
    } catch {
      return {};
    }
  }
  if (typeof metadata === "object") {
    return Object.fromEntries(
      Object.entries(metadata as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : String(v)])
    );
  }
  return {};
};

// Map a streamed RealtimeSpan onto TraceViewSpan. Token/cost come off
// `gen_ai.usage.*` attrs — without this, streamed LLM spans render 0 tokens / $0.
const realtimeToTraceViewSpan = (s: RealtimeSpan): TraceViewSpan => {
  const attrs = (s.attributes ?? {}) as Record<string, unknown>;
  const num = (key: string) => Number(attrs[key]) || 0;
  const inputTokens = num("gen_ai.usage.input_tokens");
  const outputTokens = num("gen_ai.usage.output_tokens");
  const inputCost = num("gen_ai.usage.input_cost");
  const outputCost = num("gen_ai.usage.output_cost");
  const model = (attrs["gen_ai.response.model"] ?? attrs["gen_ai.request.model"]) as string | undefined;

  return {
    spanId: s.spanId,
    parentSpanId: s.parentSpanId,
    traceId: s.traceId,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    attributes: s.attributes,
    spanType: s.spanType,
    path: "",
    events: [],
    status: s.status,
    model,
    pending: false,
    collapsed: false,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheReadInputTokens: num("gen_ai.usage.cache_read_input_tokens"),
    reasoningTokens: num("gen_ai.usage.reasoning_tokens"),
    inputCost,
    outputCost,
    totalCost: num("gen_ai.usage.cost") || inputCost + outputCost,
  } as TraceViewSpan;
};

// Dedupe by spanId (newest endTime wins; `incomingWins` breaks ties), preserve
// `collapsed`, sort by startTime, enrich pending.
const mergeSpans = (base: TraceViewSpan[], incoming: TraceViewSpan[], incomingWins = true): TraceViewSpan[] => {
  const byId = new Map<string, TraceViewSpan>();
  for (const s of base) byId.set(s.spanId, s);
  for (const s of incoming) {
    const prev = byId.get(s.spanId);
    if (!prev) {
      byId.set(s.spanId, s);
      continue;
    }
    // Real spans always beat pending placeholders (whose endTime can run ahead).
    if (prev.pending !== s.pending) {
      if (prev.pending) byId.set(s.spanId, { ...s, collapsed: prev.collapsed });
      continue;
    }
    // Per-span recency: an older snapshot (e.g. lagging CH fetch) never wins.
    const prevEnd = new Date(prev.endTime).getTime();
    const incEnd = new Date(s.endTime).getTime();
    const incomingNewer = incEnd > prevEnd || (incEnd === prevEnd && incomingWins);
    if (incomingNewer) byId.set(s.spanId, { ...s, collapsed: prev.collapsed });
  }
  const merged = [...byId.values()].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return enrichSpansWithPending(merged);
};

// Minimal TraceRow for a trace we only know the id of (live trace_update).
const minimalTraceRow = (traceId: string, metadata: Record<string, string> = {}): TraceRow => ({
  id: traceId,
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputCost: 0,
  outputCost: 0,
  totalCost: 0,
  traceType: "DEFAULT",
  metadata,
  status: "success",
  spanTags: [],
  traceTags: [],
});

// Lifecycle of a trace block's row: absent → not requested yet (virtualizer
// hasn't scrolled it into view), "loading" → queued/in-flight batch fetch,
// "loaded" → row present in base `traces`, "missing" → the server didn't have
// it (deleted, or not flushed to CH yet — realtime fills the latter in live).
export type TraceRowState = "loading" | "loaded" | "missing";

interface DebuggerSessionViewState {
  // The ordered timeline: trace / evaluation / text blocks. Single source of
  // truth for what renders and in what order (by block `createdAt`).
  blocks: SessionBlockView[];

  // Per-trace row load state for `trace` blocks (see TraceRowState).
  traceRowStates: Record<string, TraceRowState>;

  // One-shot scroll request: outline click → the virtualized timeline scrolls
  // the block into view (anchors don't work under virtualization — offscreen
  // blocks aren't in the DOM).
  scrollToBlockId: string | null;

  // Block currently at the top of the viewport — drives the outline's active
  // row (replaces the IntersectionObserver, which can't see unmounted rows).
  activeBlockId: string | null;

  // True while scrolling to a clicked block — the scroll tracker defers so it stays active.
  isNavigatingToBlock: boolean;

  // Per-trace span fetch in flight: dedupes concurrent fetches, drives the
  // skeleton. Expand always refetches, so a failed fetch heals on re-expand.
  traceSpansFetching: Record<string, boolean>;

  // Displayed session name used by the BREADCRUMB. Seeded from the breadcrumb prop
  // (`name ?? id`) at store creation; updated live by the `session_update` realtime
  // event so a rename reflects without reload.
  sessionName: string;

  // The session's REAL name, or null when it has never been named. Drives the
  // editable page title (the ghost input shows a "Set session name" placeholder
  // when null) — distinct from `sessionName`, which falls back to the id for the
  // breadcrumb. Updated alongside `sessionName` on rename.
  sessionNameRaw: string | null;

  // True when a run was added live via trace_update — drives the "New trace" pill
  // at the bottom of the view. Cleared on pill click / dismiss. Transient.
  newTraceNotice: boolean;

  // Prevents the "New trace" pill from flashing on page load.
  isInitialTracesLoaded: boolean;
}

interface DebuggerSessionViewActions {
  // Expand-path fetch: always fetches (deduped while in flight), directly — the
  // base slice's shape-based guard would skip the fetch once any SSE span landed.
  fetchTraceSpans: (trace: TraceRow) => Promise<void>;

  // Fetch the session's ordered block index (trace blocks are id-only refs;
  // evals/text arrive hydrated). Trace rows load lazily via ensureTraceRows.
  fetchSessionBlocks: (sessionId: string) => Promise<void>;

  // Request full rows for trace blocks scrolled into view. Debounced +
  // batched (one request per ≤100 ids); already loaded/loading ids are
  // skipped, so calling with every visible id on each scroll is cheap.
  ensureTraceRows: (traceIds: string[]) => void;

  // Outline click → scroll the virtualized timeline to this block.
  requestScrollToBlock: (blockId: string) => void;
  consumeScrollToBlock: () => void;

  // Timeline reports the topmost visible block (drives the outline).
  setActiveBlockId: (blockId: string | null) => void;

  // Set by the timeline around its scroll-to-block animation.
  setNavigatingToBlock: (navigating: boolean) => void;

  // Realtime: upsert a streamed span.
  applyRealtimeSpan: (span: RealtimeSpan) => void;

  // Batch entry point for a span_update payload.
  applyRealtimeSpans: (spans: RealtimeSpan[]) => void;

  // Realtime: merge a trace_update into the block list (add + auto-expand if new).
  applyTraceUpdate: (t: { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }) => void;

  // Batch entry point for a trace_update payload.
  applyTraceUpdates: (traces: { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }[]) => void;

  // Realtime: upsert a pushed note / eval block (by id). Traces are ignored here
  // (they arrive via trace_update).
  applyBlockUpdate: (block: SessionBlock) => void;

  // One-shot catch-up for a realtime-added run: real row stats + pre-subscribe
  // spans (trace_update payloads carry neither).
  hydrateTraceRow: (traceId: string) => Promise<void>;

  // Live rename (driven by the `session_update` realtime event).
  setSessionName: (name: string) => void;

  // Hide the "New trace" pill (pill click or its X).
  dismissNewTraceNotice: () => void;

  // Span type for a loaded span (drives the span-ref chip icon).
  getSpanType: (traceId: string, spanId: string) => SpanType | undefined;
  // Which loaded trace contains a span — resolves note span-references (text
  // blocks aren't tied to one trace) to a (traceId, spanId) the panel can open.
  findTraceIdForSpan: (spanId: string) => string | undefined;
}

export type DebuggerSessionViewStore = BaseSessionViewStore & DebuggerSessionViewState & DebuggerSessionViewActions;

// Seed a single trace block for the /alpha single-trace harness (no session, so
// no blocks come from the server).
const seedBlocksFromTrace = (trace: TraceRow): SessionBlockView[] => [
  { id: `trace:${trace.id}`, type: "trace", createdAt: trace.startTime, traceId: trace.id },
];

export const createDebuggerSessionViewStore = (options?: {
  initialTraceRow?: TraceRow;
  initialSessionName?: string;
  initialSessionNameRaw?: string | null;
  projectId?: string;
  storeKey?: string;
}) =>
  createStore<DebuggerSessionViewStore>()(
    persist(
      (set, get) => {
        const baseSlice = createBaseSessionViewSlice<DebuggerSessionViewStore>(set, get, {});

        // --- Lazy trace-row batching (ensureTraceRows). Closure state, not store
        // state: the pending set / timer are implementation details no component
        // subscribes to. sessionId is captured from fetchSessionBlocks (the /alpha
        // harness has none — its single row is seeded at creation, so nothing is
        // ever queued). ---
        let rowFetchSessionId: string | undefined;
        const pendingRowIds = new Set<string>();
        let rowFetchTimer: ReturnType<typeof setTimeout> | null = null;
        const ROW_BATCH_SIZE = 100; // server cap per request
        const ROW_FETCH_DEBOUNCE_MS = 150;

        const flushRowFetches = async () => {
          const { projectId } = get();
          const sessionId = rowFetchSessionId;
          const ids = [...pendingRowIds];
          pendingRowIds.clear();
          if (!projectId || !sessionId || ids.length === 0) return;

          for (let i = 0; i < ids.length; i += ROW_BATCH_SIZE) {
            const chunk = ids.slice(i, i + ROW_BATCH_SIZE);
            try {
              const res = await fetch(
                `/api/projects/${projectId}/debugger-sessions/${sessionId}/blocks?traceIds=${chunk.join(",")}`
              );
              if (!res.ok) throw new Error("Failed to load runs");
              const body = (await res.json()) as { traces: TraceRow[] };
              const fetchedRows = (body.traces ?? []).map((t) => ({ ...t, metadata: normalizeMetadata(t.metadata) }));
              const fetchedIds = new Set(fetchedRows.map((t) => t.id));
              set((s) => {
                const localIds = new Set(s.traces.map((t) => t.id));
                const nextStates = { ...s.traceRowStates };
                for (const id of chunk) {
                  // A realtime minimal row that CH doesn't have yet still counts as
                  // loaded — hydrateTraceRow owns refining it.
                  nextStates[id] = fetchedIds.has(id) || localIds.has(id) ? "loaded" : "missing";
                }
                // Fetched row wins over an existing (minimal/live) row, except a
                // realtime-bumped endTime that's ahead of the CH snapshot.
                const prevById = new Map(s.traces.map((t) => [t.id, t]));
                const merged = fetchedRows.map((f) => {
                  const live = prevById.get(f.id);
                  if (!live) return f;
                  const liveEndAhead = new Date(live.endTime).getTime() > new Date(f.endTime).getTime();
                  return { ...f, endTime: liveEndAhead ? live.endTime : f.endTime };
                });
                const untouched = s.traces.filter((t) => !fetchedIds.has(t.id));
                return {
                  traceRowStates: nextStates,
                  traces: [...untouched, ...merged],
                } as Partial<DebuggerSessionViewStore>;
              });
            } catch {
              // Clear the marks so the next scroll-into-view retries the chunk.
              set((s) => {
                const nextStates = { ...s.traceRowStates };
                for (const id of chunk) delete nextStates[id];
                return { traceRowStates: nextStates } as Partial<DebuggerSessionViewStore>;
              });
            }
          }
        };

        return {
          ...baseSlice,

          // Seeded at creation (static per page) — no URL-param sync effect.
          projectId: options?.projectId,

          // Seed base `traces` + a single trace block with the /alpha trace when provided.
          traces: options?.initialTraceRow ? [options.initialTraceRow] : [],
          blocks: options?.initialTraceRow ? seedBlocksFromTrace(options.initialTraceRow) : [],
          traceRowStates: options?.initialTraceRow ? { [options.initialTraceRow.id]: "loaded" as const } : {},
          scrollToBlockId: null,
          activeBlockId: null,
          isNavigatingToBlock: false,

          sessionName: options?.initialSessionName ?? "Session",
          sessionNameRaw: options?.initialSessionNameRaw ?? null,
          traceSpansFetching: {},
          newTraceNotice: false,
          isInitialTracesLoaded: false,

          fetchTraceSpans: async (trace) => {
            if (get().traceSpansFetching[trace.id]) return;

            set(
              (s) =>
                ({
                  traceSpansFetching: { ...s.traceSpansFetching, [trace.id]: true },
                  traceSpansError: { ...s.traceSpansError, [trace.id]: undefined },
                }) as Partial<DebuggerSessionViewStore>
            );
            try {
              const { projectId } = get();
              if (!projectId) return;
              const spanParams = new URLSearchParams();
              spanParams.set("startDate", new Date(new Date(trace.startTime).getTime() - 1000).toISOString());
              spanParams.set("endDate", new Date(new Date(trace.endTime).getTime() + 1000).toISOString());
              const res = await fetch(`/api/projects/${projectId}/traces/${trace.id}/spans?${spanParams.toString()}`);
              if (!res.ok) throw new Error("Failed to load spans");
              const fetchedSpans = (await res.json()) as TraceViewSpan[];
              // Always write the slot (even empty) so the expanded body resolves out
              // of its skeleton; merge preserves anything streamed in meanwhile.
              // incomingWins=false: on a re-expand a lagging CH snapshot must not
              // clobber equal-recency live SSE spans — ties keep the live span.
              get().setTraceSpans(trace.id, mergeSpans(get().traceSpans[trace.id] ?? [], fetchedSpans, false));
            } catch {
              // The UI keeps whatever streamed; re-expand retries.
              set(
                (s) =>
                  ({
                    traceSpansError: { ...s.traceSpansError, [trace.id]: "Failed to load spans" },
                  }) as Partial<DebuggerSessionViewStore>
              );
              toast({
                variant: "destructive",
                title: "Failed to load spans",
                description: "Collapse and expand the run to retry.",
              });
            } finally {
              set(
                (s) =>
                  ({
                    traceSpansFetching: { ...s.traceSpansFetching, [trace.id]: false },
                  }) as Partial<DebuggerSessionViewStore>
              );
            }
          },

          fetchSessionBlocks: async (sessionId) => {
            const { projectId } = get();
            if (!projectId) return;
            rowFetchSessionId = sessionId;

            get().setIsTracesLoading(true);
            get().setTracesError(undefined);
            try {
              const res = await fetch(`/api/projects/${projectId}/debugger-sessions/${sessionId}/blocks`);
              if (!res.ok) {
                const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
                get().setTracesError(err.error || "Failed to load session blocks");
                return;
              }
              const body = (await res.json()) as { blocks: SessionBlock[] };
              const fetchedBlocks = body.blocks ?? [];

              // MERGE, don't replace: a run added live mid-fetch is absent from the
              // (possibly lagged) index — wholesale replace would wipe it. Trace
              // rows are untouched here — they load lazily via ensureTraceRows;
              // rows/states already present (realtime, prior scroll) stay valid.
              const fetchedTraceIds = new Set(fetchedBlocks.flatMap((b) => (b.type === "trace" ? [b.traceId] : [])));
              const fetchedBlockIds = new Set(fetchedBlocks.map((b) => b.id));
              set((s) => {
                // Preserve blocks added by realtime while the fetch was in flight
                // (server snapshot predates them). Traces dedupe by traceId (their
                // id differs across sources); eval/text by id (shared deterministic id).
                const realtimeOnlyBlocks = s.blocks.filter((b) =>
                  b.type === "trace" ? !fetchedTraceIds.has(b.traceId) : !fetchedBlockIds.has(b.id)
                );
                return {
                  blocks: sortBlocks([...fetchedBlocks, ...realtimeOnlyBlocks]),
                } as Partial<DebuggerSessionViewStore>;
              });
            } catch (e) {
              get().setTracesError(e instanceof Error ? e.message : "Failed to load session blocks");
            } finally {
              get().setIsTracesLoading(false);
              // Even on error, so a failed initial fetch can't suppress the pill forever.
              set({ isInitialTracesLoaded: true } as Partial<DebuggerSessionViewStore>);
            }
          },

          ensureTraceRows: (traceIds) => {
            const states = get().traceRowStates;
            const missing = traceIds.filter((id) => !states[id] && !pendingRowIds.has(id));
            if (missing.length === 0) return;
            // Mark synchronously so a re-render mid-debounce can't double-queue.
            set((s) => {
              const nextStates = { ...s.traceRowStates };
              for (const id of missing) nextStates[id] = "loading";
              return { traceRowStates: nextStates } as Partial<DebuggerSessionViewStore>;
            });
            for (const id of missing) pendingRowIds.add(id);
            if (rowFetchTimer) clearTimeout(rowFetchTimer);
            rowFetchTimer = setTimeout(() => void flushRowFetches(), ROW_FETCH_DEBOUNCE_MS);
          },

          // Also set activeBlockId so the outline lights up on click (survives the scroll).
          requestScrollToBlock: (blockId) =>
            set({ scrollToBlockId: blockId, activeBlockId: blockId } as Partial<DebuggerSessionViewStore>),
          consumeScrollToBlock: () => {
            if (get().scrollToBlockId !== null) set({ scrollToBlockId: null } as Partial<DebuggerSessionViewStore>);
          },
          setActiveBlockId: (blockId) => {
            if (get().activeBlockId !== blockId) {
              set({ activeBlockId: blockId } as Partial<DebuggerSessionViewStore>);
            }
          },
          setNavigatingToBlock: (navigating) => {
            if (get().isNavigatingToBlock !== navigating) {
              set({ isNavigatingToBlock: navigating } as Partial<DebuggerSessionViewStore>);
            }
          },

          applyRealtimeSpan: (span) => {
            const traceId = span.traceId;
            const tvSpan = realtimeToTraceViewSpan(span);

            // Unconditional upsert — a span may arrive before its trace_update creates
            // the row; it just sits in the map until the row renders.
            get().setTraceSpans(traceId, mergeSpans(get().traceSpans[traceId] ?? [], [tvSpan]));

            // Bump the row's endTime — but only rebuild `traces` when it actually
            // moves, or every streamed span would bust the derived memos.
            const spanEndMs = new Date(span.endTime).getTime();
            if (Number.isNaN(spanEndMs)) return;
            const targetRow = get().traces.find((t) => t.id === traceId);
            if (!targetRow || spanEndMs <= new Date(targetRow.endTime).getTime()) return;
            get().setTraces((traces) => traces.map((t) => (t.id === traceId ? { ...t, endTime: span.endTime } : t)));
          },

          applyRealtimeSpans: (spans) => {
            for (const span of spans) get().applyRealtimeSpan(span);
          },

          applyTraceUpdate: (t) => {
            if (!t.traceId) return;
            const metadata = normalizeMetadata(t.metadata);
            const existingBlock = get().blocks.find((b) => b.type === "trace" && b.traceId === t.traceId);
            const hasRow = get().traces.some((row) => row.id === t.traceId);

            if (!existingBlock || !hasRow) {
              // Unknown run (or a known block whose row was never lazily loaded —
              // e.g. a re-run streaming into an offscreen block) → add a
              // placeholder row (+ trace block when new); any spans that raced
              // ahead are already in `traceSpans`. Mark the row loaded — the
              // hydrate below refines it, and ensureTraceRows must not refetch.
              if (!hasRow) {
                get().setTraces((traces) => [...traces, minimalTraceRow(t.traceId, metadata)]);
                set(
                  (s) =>
                    ({
                      traceRowStates: { ...s.traceRowStates, [t.traceId]: "loaded" },
                    }) as Partial<DebuggerSessionViewStore>
                );
              }
              if (!existingBlock) {
                set(
                  (s) =>
                    ({
                      blocks: sortBlocks([
                        ...s.blocks,
                        {
                          id: `trace:${t.traceId}`,
                          type: "trace",
                          createdAt: new Date().toISOString(),
                          traceId: t.traceId,
                        },
                      ]),
                    }) as Partial<DebuggerSessionViewStore>
                );
              }
              // Hydrate FIRST: its sync prefix marks fetching, so the auto-expand's
              // fetchTraceSpans dedupes — one fetch per new run.
              void get().hydrateTraceRow(t.traceId);
              get().setTraceExpanded(t.traceId, true);
              // Pill only for genuinely new runs, after the initial fetch settles,
              // so it can't flash on load.
              if (!existingBlock && get().isInitialTracesLoaded) {
                set({ newTraceNotice: true } as Partial<DebuggerSessionViewStore>);
              }
              return;
            }

            // Known run → update the row's hasBrowserSession.
            if (typeof t.hasBrowserSession === "boolean") {
              get().setTraces((traces) =>
                traces.map((row) => (row.id === t.traceId ? { ...row, hasBrowserSession: t.hasBrowserSession } : row))
              );
            }
          },

          applyTraceUpdates: (traces) => {
            for (const t of traces) get().applyTraceUpdate(t);
          },

          applyBlockUpdate: (block) => {
            if (block.type === "trace") return;
            const view: SessionBlockView =
              block.type === "evaluation"
                ? { id: block.id, type: "evaluation", createdAt: block.createdAt, evaluation: block.evaluation }
                : { id: block.id, type: "text", createdAt: block.createdAt, text: block.text };
            set((s) => {
              const rest = s.blocks.filter((b) => b.id !== view.id);
              return { blocks: sortBlocks([...rest, view]) } as Partial<DebuggerSessionViewStore>;
            });
          },

          hydrateTraceRow: async (traceId) => {
            const { projectId } = get();
            if (!projectId) return;
            if (get().traceSpansFetching[traceId]) return;

            // Mark fetching in the SYNCHRONOUS prefix (before any await) so a streamed
            // span can never flash "No spans found" ahead of the skeleton.
            set(
              (s) =>
                ({
                  traceSpansFetching: { ...s.traceSpansFetching, [traceId]: true },
                }) as Partial<DebuggerSessionViewStore>
            );
            try {
              const params = new URLSearchParams();
              params.set("pageNumber", "0");
              params.set("pageSize", "1");
              params.append("filter", JSON.stringify({ column: "id", operator: "eq", value: traceId }));
              const res = await fetch(`/api/projects/${projectId}/traces?${params.toString()}`);
              if (!res.ok) throw new Error("Failed to load run");
              const body = (await res.json()) as { items: TraceRow[] };
              const fetched = body.items?.[0];
              if (!fetched) return;

              get().setTraces((traces) =>
                traces.map((row) => {
                  if (row.id !== traceId) return row;
                  // Keep a realtime-bumped endTime that's ahead of the (possibly
                  // lagging) fetched snapshot.
                  const liveEndAhead = new Date(row.endTime).getTime() > new Date(fetched.endTime).getTime();
                  return {
                    ...fetched,
                    metadata: normalizeMetadata(fetched.metadata),
                    endTime: liveEndAhead ? row.endTime : fetched.endTime,
                  };
                })
              );

              // Recover spans persisted BEFORE we subscribed, now that real trace
              // times are known; merge preserves anything streamed meanwhile.
              const startDate = new Date(new Date(fetched.startTime).getTime() - 1000).toISOString();
              const endDate = new Date(new Date(fetched.endTime).getTime() + 1000).toISOString();
              const spanParams = new URLSearchParams();
              spanParams.set("startDate", startDate);
              spanParams.set("endDate", endDate);
              const spansRes = await fetch(
                `/api/projects/${projectId}/traces/${traceId}/spans?${spanParams.toString()}`
              );
              if (!spansRes.ok) throw new Error("Failed to load spans");
              const fetchedSpans = (await spansRes.json()) as TraceViewSpan[];
              if (fetchedSpans.length > 0) {
                const live = get().traceSpans[traceId] ?? [];
                // incomingWins=false: keep equal-recency live SSE spans over a
                // possibly-lagging CH snapshot (same tie-break as the expand fetch).
                get().setTraceSpans(traceId, mergeSpans(live, fetchedSpans, false));
              }
            } catch {
              // The UI keeps whatever streamed; re-expand retries.
              toast({
                variant: "destructive",
                title: "Failed to load run data",
                description: "Collapse and expand the run to retry.",
              });
            } finally {
              // Unconditional — the skeleton must always resolve (the old P1).
              set(
                (s) =>
                  ({
                    traceSpansFetching: { ...s.traceSpansFetching, [traceId]: false },
                  }) as Partial<DebuggerSessionViewStore>
              );
            }
          },

          setSessionName: (name) =>
            set({ sessionName: name, sessionNameRaw: name } as Partial<DebuggerSessionViewStore>),

          dismissNewTraceNotice: () => set({ newTraceNotice: false } as Partial<DebuggerSessionViewStore>),

          getSpanType: (traceId, spanId) => get().traceSpans[traceId]?.find((s) => s.spanId === spanId)?.spanType,

          findTraceIdForSpan: (spanId) => {
            for (const [traceId, spans] of Object.entries(get().traceSpans)) {
              if (spans.some((s) => s.spanId === spanId)) return traceId;
            }
            return undefined;
          },
        };
      },
      {
        name: options?.storeKey ?? "debugger-session-view-state",
        partialize: (state) => ({
          sessionPanelWidth: state.sessionPanelWidth,
          spanPanelWidth: state.spanPanelWidth,
        }),
        merge: (persistedState, currentState) => {
          const persisted = (persistedState ?? {}) as Record<string, unknown>;
          return {
            ...currentState,
            ...(typeof persisted.sessionPanelWidth === "number" && { sessionPanelWidth: persisted.sessionPanelWidth }),
            ...(typeof persisted.spanPanelWidth === "number" && { spanPanelWidth: persisted.spanPanelWidth }),
          };
        },
      }
    )
  );

// Debugger-only context (the base context is provided in parallel for shared children).
export const DebuggerSessionViewContext = createContext<StoreApi<DebuggerSessionViewStore> | undefined>(undefined);

interface DebuggerSessionViewStoreProviderProps {
  initialTraceRow?: TraceRow;
  initialSessionName?: string;
  initialSessionNameRaw?: string | null;
  storeKey?: string;
}

const DebuggerSessionViewStoreProvider = ({
  children,
  initialTraceRow,
  initialSessionName,
  initialSessionNameRaw,
  storeKey,
}: PropsWithChildren<DebuggerSessionViewStoreProviderProps>) => {
  const { projectId } = useParams<{ projectId: string }>();
  const [storeState] = useState(() =>
    createDebuggerSessionViewStore({ initialTraceRow, initialSessionName, initialSessionNameRaw, projectId, storeKey })
  );

  // Provide both the base context (shared session-view children) and the
  // debugger context (debugger chrome + the optional hook).
  return (
    <SessionViewContext.Provider value={storeState}>
      <DebuggerSessionViewContext.Provider value={storeState}>{children}</DebuggerSessionViewContext.Provider>
    </SessionViewContext.Provider>
  );
};

export const useDebuggerSessionViewStore = <T,>(selector: (store: DebuggerSessionViewStore) => T): T => {
  const store = useContext(DebuggerSessionViewContext);
  if (!store) {
    throw new Error("useDebuggerSessionViewStore must be used within a DebuggerSessionViewContext provider");
  }
  return useStore(store, selector);
};

export const useDebuggerSessionViewStoreRaw = () => {
  const store = useContext(DebuggerSessionViewContext);
  if (!store) {
    throw new Error("useDebuggerSessionViewStoreRaw must be used within a DebuggerSessionViewContext provider");
  }
  return store;
};

export default DebuggerSessionViewStoreProvider;
