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
import { parseCommandBlockContent } from "@/lib/actions/debugger-sessions/command-content";
import { toast } from "@/lib/hooks/use-toast";
import { createIdBatchLoader } from "@/lib/id-batch-loader";
import { mergeTraceDelta, realtimeTraceToRow } from "@/lib/traces/realtime";
import { type RealtimeSpan, type RealtimeTracePayload, type SpanType, type TraceRow } from "@/lib/traces/types";
import { tryParseJson } from "@/lib/utils";

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

// --- Command run grouping (shared with the debugger-list flat-rows builder) ---
// Contiguous command blocks collapse into ONE visual group; there is no stored
// group entity, so its identity is derived from block order. These two helpers
// are the single source of that rule so the render-time grouping and the store's
// live auto-expand can never disagree on where a run starts.

// A missing trace block renders nothing and is TRANSPARENT to a command run — it
// neither joins nor breaks it. The one subtle bit of the grouping rule.
export const isRunTransparentBlock = (
  block: SessionBlockView,
  tracesById: Map<string, TraceRow>,
  traceRowStates: Record<string, TraceRowState>
): boolean => block.type === "trace" && !tracesById.get(block.traceId) && traceRowStates[block.traceId] === "missing";

// The group KEY for a command block: the first command in its maximal contiguous
// run (transparent blocks skipped), matching the group id the flat-rows builder
// emits. Returns `id` itself when it heads its run (run of one / the first one).
export const firstCommandIdOfRun = (
  blocks: SessionBlockView[],
  id: string,
  tracesById: Map<string, TraceRow>,
  traceRowStates: Record<string, TraceRowState>
): string => {
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx < 0) return id;
  let firstId = id;
  for (let i = idx - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === "command") {
      firstId = b.id;
      continue;
    }
    if (isRunTransparentBlock(b, tracesById, traceRowStates)) continue;
    break;
  }
  return firstId;
};

const MAX_LOADED_TRACE_SPANS = 25;

// Normalize metadata (object OR JSON string) into TraceRow's Record<string,string>.
const normalizeMetadata = (metadata: unknown): Record<string, string> => {
  const parsed = typeof metadata === "string" ? tryParseJson(metadata) : metadata;
  if (!parsed || typeof parsed !== "object") return {};
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, typeof v === "string" ? v : String(v)]));
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

// Merge an incoming row onto an existing one without letting an absent field
// clobber a present one: only defined incoming keys override, and an empty
// `agentInput` never overwrites a populated one (the CH column is "" until the
// async extraction lands, which would erase a live-flushed input). The later
// endTime always wins (a realtime bump can run ahead of a CH snapshot).
const mergeTraceRow = (prev: TraceRow, next: TraceRow): TraceRow => {
  const merged: TraceRow = { ...prev };
  for (const key of Object.keys(next) as (keyof TraceRow)[]) {
    const value = next[key];
    if (value === undefined) continue;
    if (key === "agentInput" && !value) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  merged.endTime = new Date(prev.endTime).getTime() > new Date(next.endTime).getTime() ? prev.endTime : next.endTime;
  // agentInput is sticky: extraction lands async, so an empty value (span batch,
  // or a row hydrated before the write) must never blank a populated one.
  merged.agentInput = next.agentInput || prev.agentInput;
  return merged;
};

// Upsert rows by id: existing rows are field-merged with the incoming value
// (preserving fuller fields + a realtime-ahead endTime); unseen incoming rows
// are appended.
const upsertTraceRows = (existing: TraceRow[], incoming: TraceRow[]): TraceRow[] => {
  const incomingById = new Map(incoming.map((t) => [t.id, t]));
  const merged = existing.map((prev) => {
    const next = incomingById.get(prev.id);
    if (!next) return prev;
    incomingById.delete(prev.id);
    return mergeTraceRow(prev, next);
  });
  return [...merged, ...incomingById.values()];
};

// Lifecycle of a trace block's row: absent → not requested yet (virtualizer
// hasn't scrolled it into view), "loading" → queued/in-flight batch fetch,
// "loaded" → row present in base `traces`, "missing" → the server didn't have
// it (deleted, or not flushed to CH yet — realtime fills the latter in live).
export type TraceRowState = "loading" | "loaded" | "missing";

// Which kind of block arrived live — drives the "New trace" / "New eval" /
// "New note" / "New command" pill.
export type NewBlockNotice = "trace" | "evaluation" | "text" | "command";

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

  // Per-trace span fetch in flight: dedupes concurrent fetches, drives the
  // skeleton. Expand always refetches, so a failed fetch heals on re-expand.
  traceSpansFetching: Record<string, boolean>;

  // Traces whose row was seeded from realtime deltas rather than fetched. Their
  // start/end only span the batches we witnessed, so a span fetch must NOT be
  // bounded by them — earlier persisted spans would fall outside the window.
  // Cleared once a fetched (cumulative) row replaces the seed.
  realtimeSeededTraceIds: Set<string>;

  // Displayed session name used by the BREADCRUMB. Seeded from the breadcrumb prop
  // (`name ?? id`) at store creation; updated live by the `session_update` realtime
  // event so a rename reflects without reload.
  sessionName: string;

  // The session's REAL name, or null when it has never been named. Drives the
  // editable page title (the ghost input shows a "Set session name" placeholder
  // when null) — distinct from `sessionName`, which falls back to the id for the
  // breadcrumb. Updated alongside `sessionName` on rename.
  sessionNameRaw: string | null;

  // Set when a block was added live (trace_update / block_update) — drives the
  // bottom pill, whose label depends on the kind. Null = hidden. Cleared on pill
  // click / dismiss. Transient.
  newBlockNotice: NewBlockNotice | null;

  // Prevents the pill from flashing on page load (blocks arriving from the
  // initial fetch must not count as "new").
  isInitialTracesLoaded: boolean;

  // Expanded `command` blocks (collapsed by default). Store-held (like
  // expandedTraceIds) so state survives the row virtualizing out and back.
  // Doubles as the per-command expand state INSIDE a command-group card.
  expandedCommandBlockIds: Set<string>;

  // Expanded `command-group` cards (collapsed by default), keyed by the group's
  // first command id (its stable blockId). Store-held for the same reason.
  expandedCommandGroupIds: Set<string>;

  // Collapsed `evaluation` blocks (expanded by default — the inverse of the
  // command set). Store-held so the state survives the row virtualizing out.
  collapsedEvaluationBlockIds: Set<string>;
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

  // Bound the number of traces holding span bodies to MAX_LOADED_TRACE_SPANS,
  // evicting the oldest-loaded traces whose block is NOT currently in the
  // window (`protectedIds`). Evicted traces drop their spans and collapse;
  // re-expanding refetches. Called by the list on every window change; cheap
  // no-op while under the cap.
  enforceLoadedTraceBound: (protectedIds: Set<string>) => void;

  // Outline click → scroll the virtualized timeline to this block.
  requestScrollToBlock: (blockId: string) => void;
  consumeScrollToBlock: () => void;

  // Timeline reports the topmost visible block (drives the outline).
  setActiveBlockId: (blockId: string | null) => void;

  // Realtime: upsert a streamed span.
  applyRealtimeSpan: (span: RealtimeSpan) => void;

  // Batch entry point for a span_update payload.
  applyRealtimeSpans: (spans: RealtimeSpan[]) => void;

  // Realtime: accumulate a per-batch stat delta onto the run's row, adding the
  // block (+ auto-expanding) when the run is new to this session.
  applyTraceUpdate: (delta: RealtimeTracePayload) => void;

  // Batch entry point for a trace_update payload.
  applyTraceUpdates: (deltas: RealtimeTracePayload[]) => void;

  // Realtime: patch a run's extracted agent_input (arrives async on its own
  // event). Applied to the row if loaded; buffered otherwise and flushed when
  // the row's trace_update creates it.
  applyAgentInput: (traceId: string, agentInput: unknown) => void;

  // Realtime: upsert a pushed note / eval block (by id). Traces are ignored here
  // (they arrive via trace_update).
  applyBlockUpdate: (block: SessionBlock) => void;

  // Live rename (driven by the `session_update` realtime event).
  setSessionName: (name: string) => void;

  // Hide the new-block pill (pill click or its X).
  dismissNewBlockNotice: () => void;

  // Expand/collapse a command block (the outer virtualizer re-measures). Also
  // toggles a single command's detail INSIDE a command-group card.
  toggleCommandBlockExpanded: (blockId: string) => void;

  // Expand/collapse a command-group card (the outer virtualizer re-measures).
  toggleCommandGroupExpanded: (blockId: string) => void;

  // Collapse/expand an evaluation block (expanded by default).
  toggleEvaluationBlock: (blockId: string) => void;

  // Span type for a loaded span (drives the span-ref chip icon).
  getSpanType: (traceId: string, spanId: string) => SpanType | undefined;
  // Which loaded trace contains a span — resolves note span-references (text
  // blocks aren't tied to one trace) to a (traceId, spanId) the panel can open.
  findTraceIdForSpan: (spanId: string) => string | undefined;
}

export type DebuggerSessionViewStore = BaseSessionViewStore & DebuggerSessionViewState & DebuggerSessionViewActions;

export const createDebuggerSessionViewStore = (options: {
  initialSessionName?: string;
  initialSessionNameRaw?: string | null;
  projectId?: string;
  sessionId: string;
  storeKey?: string;
}) =>
  createStore<DebuggerSessionViewStore>()(
    persist(
      (set, get) => {
        const baseSlice = createBaseSessionViewSlice<DebuggerSessionViewStore>(set, get, {});

        // agent_input arrives async on its own event, sometimes before the
        // run's row exists. Buffer by traceId (latest wins); flushed by
        // applyTraceUpdate when it creates the row. Closure-scoped per store.
        const pendingAgentInputById = new Map<string, string>();
        const stringifyAgentInput = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

        // Lazy trace-row batching: the loader owns the pending set / debounce /
        // chunking; the store owns only the merge + state marks below.
        const rowLoader = createIdBatchLoader<TraceRow>({
          batchSize: 100, // server cap per request
          debounceMs: 150,
          getId: (row) => row.id,
          fetchBatch: async (ids) => {
            const { projectId, sessionId } = options;
            if (!projectId) return [];
            // POST (not `?traceIds=`) so a full window of ids can't overflow the URL.
            const res = await fetch(`/api/projects/${projectId}/debugger-sessions/${sessionId}/blocks`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ traceIds: ids }),
            });
            if (!res.ok) throw new Error("Failed to load runs");
            const body = (await res.json()) as { traces: TraceRow[] };
            return (body.traces ?? []).map((t) => ({ ...t, metadata: normalizeMetadata(t.metadata) }));
          },
          onBatch: (requestedIds, rowsById) =>
            set((s) => {
              // A realtime-seeded row CH doesn't have yet still counts as loaded
              // (deltas keep it current); truly absent ids are missing.
              const localIds = new Set(s.traces.map((t) => t.id));
              const nextStates = { ...s.traceRowStates };
              for (const id of requestedIds) {
                nextStates[id] = rowsById.has(id) || localIds.has(id) ? "loaded" : "missing";
              }
              // A fetched row carries cumulative times, so it supersedes the
              // seed and its bounds are safe to fetch spans by again.
              let seeded: Set<string> | null = null;
              for (const id of rowsById.keys()) {
                if (!s.realtimeSeededTraceIds.has(id)) continue;
                if (!seeded) seeded = new Set(s.realtimeSeededTraceIds);
                seeded.delete(id);
              }
              return {
                traceRowStates: nextStates,
                traces: upsertTraceRows(s.traces, [...rowsById.values()]),
                ...(seeded ? { realtimeSeededTraceIds: seeded } : {}),
              } as Partial<DebuggerSessionViewStore>;
            }),
          onError: (requestedIds) =>
            // Clear the marks so the next scroll-into-view retries the chunk.
            set((s) => {
              const nextStates = { ...s.traceRowStates };
              for (const id of requestedIds) delete nextStates[id];
              return { traceRowStates: nextStates } as Partial<DebuggerSessionViewStore>;
            }),
        });

        return {
          ...baseSlice,

          // Seeded at creation (static per page) — no URL-param sync effect.
          projectId: options.projectId,

          // Blocks + rows load lazily via fetchSessionBlocks / ensureTraceRows.
          traces: [],
          blocks: [],
          traceRowStates: {},
          scrollToBlockId: null,
          activeBlockId: null,

          sessionName: options.initialSessionName ?? "Session",
          sessionNameRaw: options.initialSessionNameRaw ?? null,
          traceSpansFetching: {},
          realtimeSeededTraceIds: new Set<string>(),
          newBlockNotice: null,
          isInitialTracesLoaded: false,
          expandedCommandBlockIds: new Set<string>(),
          expandedCommandGroupIds: new Set<string>(),
          collapsedEvaluationBlockIds: new Set<string>(),

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
              // A realtime-seeded row's times cover only the batches we saw, so
              // bounding by them would hide spans persisted before we
              // subscribed. Omitting both dates drops the time predicate
              // entirely; `trace_id` is what prunes the scan either way.
              const spanParams = new URLSearchParams();
              if (!get().realtimeSeededTraceIds.has(trace.id)) {
                spanParams.set("startDate", new Date(new Date(trace.startTime).getTime() - 1000).toISOString());
                spanParams.set("endDate", new Date(new Date(trace.endTime).getTime() + 1000).toISOString());
              }
              const query = spanParams.size > 0 ? `?${spanParams.toString()}` : "";
              const res = await fetch(`/api/projects/${projectId}/traces/${trace.id}/spans${query}`);
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
            // "loading" marks are the dedupe: an id already requested is skipped.
            const missing = traceIds.filter((id) => !states[id]);
            if (missing.length === 0) return;
            set((s) => {
              const nextStates = { ...s.traceRowStates };
              for (const id of missing) nextStates[id] = "loading";
              return { traceRowStates: nextStates } as Partial<DebuggerSessionViewStore>;
            });
            rowLoader.load(missing);
          },

          enforceLoadedTraceBound: (protectedIds) => {
            const keys = Object.keys(get().traceSpans);
            const overflow = keys.length - MAX_LOADED_TRACE_SPANS;
            if (overflow <= 0) return;
            // Oldest-first (Record insertion order = recency); never touch a
            // trace whose block is on screen.
            const victims: string[] = [];
            for (const key of keys) {
              if (victims.length >= overflow) break;
              if (!protectedIds.has(key)) victims.push(key);
            }
            if (victims.length === 0) return;
            set((s) => {
              const traceSpans = { ...s.traceSpans };
              const traceSpansError = { ...s.traceSpansError };
              const traceSpansFetching = { ...s.traceSpansFetching };
              let expandedTraceIds: Set<string> | null = null;
              for (const id of victims) {
                delete traceSpans[id];
                delete traceSpansError[id];
                delete traceSpansFetching[id];
                if (s.expandedTraceIds.has(id)) {
                  if (!expandedTraceIds) expandedTraceIds = new Set(s.expandedTraceIds);
                  expandedTraceIds.delete(id);
                }
              }
              return {
                traceSpans,
                traceSpansError,
                traceSpansFetching,
                ...(expandedTraceIds ? { expandedTraceIds } : {}),
              } as Partial<DebuggerSessionViewStore>;
            });
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

          applyTraceUpdate: (delta) => {
            const traceId = delta.id;
            if (!traceId) return;
            const existingBlock = get().blocks.find((b) => b.type === "trace" && b.traceId === traceId);
            const rowState = get().traceRowStates[traceId];
            const hasRow = get().traces.some((row) => row.id === traceId);

            if (hasRow) {
              get().setTraces((traces) =>
                traces.map((row) => (row.id === traceId ? mergeTraceDelta(row, delta) : row))
              );
              return;
            }

            // No row yet. Seeding from a delta is only correct when we've seen
            // every batch for the run — true for a run that is new to this
            // session, false for a known block whose row was never lazily
            // loaded (its earlier batches predate us, so seeding would show
            // wrong-low totals AND mark the row loaded, so ensureTraceRows
            // never corrects it). Until the blocks index has loaded, an empty
            // `blocks` can't prove "new" — drop; later deltas seed or merge
            // once the index lands. Same drop for a known block. Only a
            // "missing" row (absent from ClickHouse) has no fetch to wait for,
            // so realtime is its sole source.
            if ((!get().isInitialTracesLoaded || existingBlock) && rowState !== "missing") return;

            const pendingInput = pendingAgentInputById.get(traceId);
            pendingAgentInputById.delete(traceId);
            const seeded = realtimeTraceToRow(delta);
            get().setTraces((traces) => [
              ...traces,
              pendingInput !== undefined ? { ...seeded, agentInput: pendingInput } : seeded,
            ]);
            set(
              (s) =>
                ({
                  traceRowStates: { ...s.traceRowStates, [traceId]: "loaded" },
                  realtimeSeededTraceIds: new Set(s.realtimeSeededTraceIds).add(traceId),
                  ...(!existingBlock
                    ? {
                        blocks: sortBlocks([
                          ...s.blocks,
                          {
                            id: `trace:${traceId}`,
                            type: "trace",
                            createdAt: delta.startTime ?? new Date().toISOString(),
                            traceId,
                          },
                        ]),
                      }
                    : {}),
                  // Pill only for genuinely new runs, after the initial fetch settles,
                  // so it can't flash on load. Don't overwrite an existing notice —
                  // the first unseen block the user hasn't scrolled to wins.
                  ...(!existingBlock && s.isInitialTracesLoaded && !s.newBlockNotice
                    ? { newBlockNotice: "trace" as const }
                    : {}),
                }) as Partial<DebuggerSessionViewStore>
            );
            // Spans that raced ahead are already in `traceSpans`; expanding also
            // fetches any persisted before we subscribed (the delta's real times
            // give fetchTraceSpans a usable window).
            get().setTraceExpanded(traceId, true);
          },

          applyTraceUpdates: (deltas) => {
            for (const delta of deltas) get().applyTraceUpdate(delta);
          },

          applyAgentInput: (traceId, agentInput) => {
            const value = stringifyAgentInput(agentInput);
            const hasRow = get().traces.some((row) => row.id === traceId);
            if (hasRow) {
              get().setTraces((traces) =>
                traces.map((row) => (row.id === traceId ? { ...row, agentInput: value } : row))
              );
            } else {
              // Row not created yet — buffer; the create branch flushes it.
              pendingAgentInputById.set(traceId, value);
            }
          },

          applyBlockUpdate: (block) => {
            if (block.type === "trace") return;
            let view: SessionBlockView;
            if (block.type === "evaluation") {
              view = { id: block.id, type: "evaluation", createdAt: block.createdAt, evaluation: block.evaluation };
            } else if (block.type === "command") {
              // Realtime payloads are raw JSON.parse output — run the same
              // validator as the fetch path so a malformed `command` content
              // can't poison the store (and crash commandSummary) verbatim.
              const command = parseCommandBlockContent(block.command);
              if (!command) return;
              view = { id: block.id, type: "command", createdAt: block.createdAt, command };
            } else {
              view = { id: block.id, type: "text", createdAt: block.createdAt, text: block.text };
            }
            // Genuinely new (not the initial fetch, not already present). Drives
            // BOTH the pill and command auto-expand — kept separate from the pill's
            // own "don't overwrite an existing notice" gate so a new command still
            // auto-expands even when a notice for an earlier unseen block stands.
            const isNew = get().isInitialTracesLoaded && !get().blocks.some((b) => b.id === view.id);
            // A live command opens only its RUN's GROUP (keyed by the run's first
            // command) so the new bead is visible — its detail card stays collapsed
            // until the user clicks it, same as an already-loaded command.
            // Idempotent — re-adding the run's stable group key is a no-op.
            const autoExpandGroup = isNew && view.type === "command";
            set((s) => {
              const rest = s.blocks.filter((b) => b.id !== view.id);
              const blocks = sortBlocks([...rest, view]);
              const patch: Partial<DebuggerSessionViewStore> = {
                blocks,
                ...(isNew && !s.newBlockNotice ? { newBlockNotice: view.type } : {}),
              };
              if (autoExpandGroup) {
                const tracesById = new Map(s.traces.map((t) => [t.id, t]));
                const groupKey = firstCommandIdOfRun(blocks, view.id, tracesById, s.traceRowStates);
                patch.expandedCommandGroupIds = new Set(s.expandedCommandGroupIds).add(groupKey);
              }
              return patch as Partial<DebuggerSessionViewStore>;
            });
          },

          setSessionName: (name) =>
            set({ sessionName: name, sessionNameRaw: name } as Partial<DebuggerSessionViewStore>),

          dismissNewBlockNotice: () => set({ newBlockNotice: null } as Partial<DebuggerSessionViewStore>),

          toggleCommandBlockExpanded: (blockId) =>
            set((s) => {
              const next = new Set(s.expandedCommandBlockIds);
              if (next.has(blockId)) next.delete(blockId);
              else next.add(blockId);
              return { expandedCommandBlockIds: next } as Partial<DebuggerSessionViewStore>;
            }),

          toggleCommandGroupExpanded: (blockId) =>
            set((s) => {
              const next = new Set(s.expandedCommandGroupIds);
              if (next.has(blockId)) next.delete(blockId);
              else next.add(blockId);
              return { expandedCommandGroupIds: next } as Partial<DebuggerSessionViewStore>;
            }),

          toggleEvaluationBlock: (blockId) =>
            set((s) => {
              const next = new Set(s.collapsedEvaluationBlockIds);
              if (next.has(blockId)) next.delete(blockId);
              else next.add(blockId);
              return { collapsedEvaluationBlockIds: next } as Partial<DebuggerSessionViewStore>;
            }),

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
        name: options.storeKey ?? "debugger-session-view-state",
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
  initialSessionName?: string;
  initialSessionNameRaw?: string | null;
  sessionId: string;
  storeKey?: string;
}

const DebuggerSessionViewStoreProvider = ({
  children,
  initialSessionName,
  initialSessionNameRaw,
  sessionId,
  storeKey,
}: PropsWithChildren<DebuggerSessionViewStoreProviderProps>) => {
  const { projectId } = useParams<{ projectId: string }>();
  const [storeState] = useState(() =>
    createDebuggerSessionViewStore({ initialSessionName, initialSessionNameRaw, projectId, sessionId, storeKey })
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
