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
import { type RealtimeSpan, type SpanType, type TraceRow } from "@/lib/traces/types";

// Trace-metadata key the coding agent writes its run note to. Naming stays
// `rollout.*` to match `rollout.session_id`. The value is an opaque markdown string.
export const NOTE_METADATA_KEY = "rollout.note";

// Max runs fetched per session (mirrors the previous multi-trace-view cap).
const MAX_RUNS = 200;

// Normalize a trace_update payload's `metadata` (object OR JSON string) into the
// Record<string,string> shape `TraceRow.metadata` carries.
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

// Map a streamed RealtimeSpan onto the TraceViewSpan shape the shared list reads.
// Only `"update"` mode exists now (span_start is dead — see content component).
// Token/cost fields come off `gen_ai.usage.*` attributes, mirroring trace-view's
// onRealtimeUpdateSpans — without this, streamed LLM spans render 0 tokens / $0.
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

// Merge incoming spans into an existing list: dedupe by spanId (incoming wins,
// preserving the existing span's `collapsed`), sort by startTime, enrich pending.
// `incomingWins=false` flips precedence so a base list (e.g. a CH fetch) overrides
// buffered/streamed duplicates for the same spanId.
const mergeSpans = (base: TraceViewSpan[], incoming: TraceViewSpan[], incomingWins = true): TraceViewSpan[] => {
  const byId = new Map<string, TraceViewSpan>();
  for (const s of base) byId.set(s.spanId, s);
  for (const s of incoming) {
    const prev = byId.get(s.spanId);
    if (!prev) byId.set(s.spanId, s);
    else if (incomingWins) byId.set(s.spanId, { ...s, collapsed: prev.collapsed });
    // incomingWins=false: keep the base entry (it already won)
  }
  const merged = [...byId.values()].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return enrichSpansWithPending(merged);
};

// Build a minimal TraceRow slot for a trace we only know the id (and maybe
// metadata) of — used by /alpha seeding and live trace_update of an unknown run.
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

interface DebuggerSessionViewState {
  // Run note source-of-truth lives on each TraceRow's metadata; no extra state.
  noteMetadataKey: string;

  // Realtime spans that arrived for a trace whose `traceSpans[traceId]` slot
  // didn't exist yet (the backend dispatches the span branch and the trace_update
  // branch concurrently, so spans can race ahead of the slot). Buffered by traceId
  // and flushed into `traceSpans` when the slot is created. Transient, not persisted.
  realtimeSpanBuffer: Record<string, TraceViewSpan[]>;

  // Displayed session name (the SessionHeader title). Seeded from the breadcrumb
  // prop at store creation; updated live by the `session_update` realtime event so
  // a rename reflects without reload.
  sessionName: string;

  // True when a run was added live via trace_update — drives the "New trace" pill
  // at the bottom of the view. Cleared on pill click / dismiss. Transient.
  newTraceNotice: boolean;
}

interface DebuggerSessionViewActions {
  // Fetch this session's runs (traces) via the `rollout.session_id` metadata
  // filter, oldest-first, into base `traces`. Reads projectId from base state.
  fetchSessionTraces: (sessionId: string) => Promise<void>;

  // Realtime: upsert a streamed span into its (already-loaded) trace.
  applyRealtimeSpan: (span: RealtimeSpan) => void;

  // Realtime: merge a trace_update into the run list (add + auto-expand if new).
  applyTraceUpdate: (t: { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }) => void;

  // Fetch the full TraceRow (real stats: tokens/cost/startTime) for a single
  // trace and merge it onto the existing row. Used to hydrate a run that first
  // appeared via a trace_update (whose payload carries no stats). Preserves the
  // row's current metadata (already merged from realtime) and its bumped endTime.
  hydrateTraceRow: (traceId: string) => Promise<void>;

  // Update the displayed session name live (driven by the `session_update`
  // realtime event after a rename via PATCH /v1/.../rollouts/{id}/name).
  setSessionName: (name: string) => void;

  // Hide the "New trace" pill (pill click or its X).
  dismissNewTraceNotice: () => void;

  // Read the agent-authored note (`rollout.note`) off a run's metadata object.
  noteForTrace: (traceId: string) => string | undefined;
  // Span type for an already-loaded span (drives the span-ref chip icon color).
  getSpanType: (traceId: string, spanId: string) => SpanType | undefined;
}

export type DebuggerSessionViewStore = BaseSessionViewStore & DebuggerSessionViewState & DebuggerSessionViewActions;

const createDebuggerSessionViewStore = (options?: {
  initialTraceRow?: TraceRow;
  initialSessionName?: string;
  storeKey?: string;
}) =>
  createStore<DebuggerSessionViewStore>()(
    persist(
      (set, get) => {
        const baseSlice = createBaseSessionViewSlice<DebuggerSessionViewStore>(set, get, {});

        return {
          ...baseSlice,

          // Seed base `traces` with the single /alpha trace when provided.
          traces: options?.initialTraceRow ? [options.initialTraceRow] : [],

          noteMetadataKey: NOTE_METADATA_KEY,
          sessionName: options?.initialSessionName ?? "Session",
          realtimeSpanBuffer: {},
          newTraceNotice: false,

          fetchSessionTraces: async (sessionId) => {
            const { projectId } = get();
            if (!projectId) return;

            get().setIsTracesLoading(true);
            get().setTracesError(undefined);
            try {
              const params = new URLSearchParams();
              params.set("pageNumber", "0");
              params.set("pageSize", String(MAX_RUNS));
              params.set("sortDirection", "ASC");
              params.append(
                "filter",
                JSON.stringify({ column: "metadata", operator: "eq", value: `rollout.session_id=${sessionId}` })
              );

              const res = await fetch(`/api/projects/${projectId}/traces?${params.toString()}`);
              if (!res.ok) {
                const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
                get().setTracesError(err.error || "Failed to load session traces");
                return;
              }
              const body = (await res.json()) as { items: TraceRow[] };
              // The /traces endpoint returns `metadata` as a raw JSON STRING (the CH
              // `metadata` column is selected verbatim — see lib/actions/traces/utils.ts;
              // the traces table parses it lazily in JsonTooltip). `TraceRow.metadata`
              // is typed as an object, so normalize here before storing — otherwise
              // noteForTrace / getSpanType read the string as an object and notes +
              // outline headings never render. (Realtime trace_update already ships a
              // JSON object and goes through normalizeMetadata in applyTraceUpdate.)
              const normalized = (body.items ?? []).map((item) => ({
                ...item,
                metadata: normalizeMetadata(item.metadata),
              }));
              // API already sorts ASC; defensively sort oldest-first for display.
              const sorted = normalized.sort(
                (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
              );
              // MERGE with current rows instead of replacing: a run that started while
              // this fetch was in flight was added by applyTraceUpdate but is absent
              // from the (CH-lagged) response — replacing wholesale wipes its row, and
              // the next trace_update then re-runs the new-run branch and clobbers the
              // populated spans slot with the (already-flushed) empty buffer →
              // "(no spans)". Fetched rows win per-id (richer stats) but keep the live
              // row's merged metadata + realtime-bumped endTime (same semantics as
              // hydrateTraceRow); realtime-only rows are kept as-is.
              get().setTraces((prev) => {
                const prevById = new Map(prev.map((t) => [t.id, t]));
                const merged = sorted.map((fetched) => {
                  const live = prevById.get(fetched.id);
                  if (!live) return fetched;
                  const liveEndAhead = new Date(live.endTime).getTime() > new Date(fetched.endTime).getTime();
                  return {
                    ...fetched,
                    metadata: { ...fetched.metadata, ...live.metadata },
                    endTime: liveEndAhead ? live.endTime : fetched.endTime,
                  };
                });
                const fetchedIds = new Set(sorted.map((t) => t.id));
                const realtimeOnly = prev.filter((t) => !fetchedIds.has(t.id));
                return [...merged, ...realtimeOnly].sort(
                  (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                );
              });
            } catch (e) {
              get().setTracesError(e instanceof Error ? e.message : "Failed to load session traces");
            } finally {
              get().setIsTracesLoading(false);
            }
          },

          applyRealtimeSpan: (span) => {
            const traceId = span.traceId;
            const tvSpan = realtimeToTraceViewSpan(span);

            if (get().traceSpans[traceId]) {
              // Slot exists → merge straight into the live list (dedupe + sort + enrich).
              get().setTraceSpans(traceId, mergeSpans(get().traceSpans[traceId], [tvSpan]));
            } else {
              // Slot not created yet. The backend dispatches the span branch and the
              // trace_update branch concurrently, so spans routinely arrive BEFORE the
              // trace_update creates the slot. Buffer here (dedupe by spanId); the
              // new-run branch in applyTraceUpdate flushes the buffer once the slot
              // exists. Previously these spans were dropped → "(no spans)" on short runs.
              set((state) => {
                const buffered = state.realtimeSpanBuffer[traceId] ?? [];
                return {
                  realtimeSpanBuffer: { ...state.realtimeSpanBuffer, [traceId]: mergeSpans(buffered, [tvSpan]) },
                } as Partial<DebuggerSessionViewStore>;
              });
            }

            // Bump the owning trace row's endTime when the span extends past it (keeps
            // list stats/ordering correct for a live run). No-op if the row doesn't
            // exist yet — the slot's endTime is seeded from the trace_update / hydrate.
            const spanEndMs = new Date(span.endTime).getTime();
            get().setTraces((traces) =>
              traces.map((t) => {
                if (t.id !== traceId) return t;
                if (Number.isNaN(spanEndMs) || spanEndMs <= new Date(t.endTime).getTime()) return t;
                return { ...t, endTime: span.endTime };
              })
            );
          },

          applyTraceUpdate: (t) => {
            if (!t.traceId) return;
            const metadata = normalizeMetadata(t.metadata);
            const existing = get().traces.find((row) => row.id === t.traceId);

            if (!existing) {
              // Unknown run → add a lightweight slot (placeholder stats) and append to
              // ordering. Initialize the spans slot to the FLUSHED realtime buffer (any
              // spans that raced ahead of this event) so the run is realtime-fed: with a
              // non-empty/defined `traceSpans[id]`, the auto-expand's ensureTraceSpans
              // short-circuits and we skip the doomed lazy fetch (it would window on the
              // placeholder "now" times AND lag ClickHouse → return [], the "(no spans)"
              // bug). Pre-existing CH spans for a run that started before view-open are
              // recovered by the one-shot fetch in hydrateTraceRow (real times, merged).
              const buffered = get().realtimeSpanBuffer[t.traceId] ?? [];
              // Never overwrite an existing populated slot: the row can vanish-and-
              // return (e.g. it was realtime-added, then a wholesale traces update
              // dropped it) while the slot kept its streamed spans — re-seeding from
              // the (already-flushed, empty) buffer would wipe them.
              const existingSlot = get().traceSpans[t.traceId];
              get().setTraces((traces) => [...traces, minimalTraceRow(t.traceId, metadata)]);
              get().setTraceSpans(t.traceId, existingSlot ? mergeSpans(existingSlot, buffered) : buffered);
              set((state) => {
                if (!(t.traceId in state.realtimeSpanBuffer)) return {} as Partial<DebuggerSessionViewStore>;
                const next = { ...state.realtimeSpanBuffer };
                delete next[t.traceId];
                return { realtimeSpanBuffer: next } as Partial<DebuggerSessionViewStore>;
              });
              get().setTraceExpanded(t.traceId, true);
              void get().hydrateTraceRow(t.traceId);
              // Surface the "New trace" pill so the user can jump to the new run.
              set({ newTraceNotice: true } as Partial<DebuggerSessionViewStore>);
              return;
            }

            // Known run → merge metadata (this is what makes live note updates work:
            // `rollout.note` arrives here after a POST /v1/traces/metadata patch).
            if (Object.keys(metadata).length === 0) return;
            get().setTraces((traces) =>
              traces.map((row) => (row.id === t.traceId ? { ...row, metadata: { ...row.metadata, ...metadata } } : row))
            );
          },

          hydrateTraceRow: async (traceId) => {
            const { projectId } = get();
            if (!projectId) return;
            // Skip if the row already has real stats (a slot has startTime===endTime).
            const current = get().traces.find((t) => t.id === traceId);
            if (current && current.startTime !== current.endTime) return;

            try {
              const params = new URLSearchParams();
              params.set("pageNumber", "0");
              params.set("pageSize", "1");
              params.append("filter", JSON.stringify({ column: "id", operator: "eq", value: traceId }));
              const res = await fetch(`/api/projects/${projectId}/traces?${params.toString()}`);
              if (!res.ok) return;
              const body = (await res.json()) as { items: TraceRow[] };
              const fetched = body.items?.[0];
              if (!fetched) return;
              const normalizedMeta = normalizeMetadata(fetched.metadata);

              get().setTraces((traces) =>
                traces.map((row) => {
                  if (row.id !== traceId) return row;
                  // Keep the live-merged metadata + any realtime-bumped endTime if it's
                  // already ahead of the fetched row's (mid-run, the fetched snapshot
                  // may lag the streamed spans).
                  const liveEndAhead = new Date(row.endTime).getTime() > new Date(fetched.endTime).getTime();
                  return {
                    ...fetched,
                    metadata: { ...normalizedMeta, ...row.metadata },
                    endTime: liveEndAhead ? row.endTime : fetched.endTime,
                  };
                })
              );

              // Recover spans that were persisted in ClickHouse BEFORE the view opened
              // (a run already in progress) — the realtime stream only carries spans
              // emitted after we subscribed. Fetch once now that we have REAL trace
              // times (the new-run slot's lazy fetch was intentionally skipped because
              // it would have windowed on placeholder "now" times). Merge CH-wins over
              // the realtime-fed slot so duplicates resolve to the fuller fetched span,
              // and any spans that streamed in during this fetch are preserved.
              const startDate = new Date(new Date(fetched.startTime).getTime() - 1000).toISOString();
              const endDate = new Date(new Date(fetched.endTime).getTime() + 1000).toISOString();
              const spanParams = new URLSearchParams();
              spanParams.append("searchIn", "input");
              spanParams.append("searchIn", "output");
              spanParams.set("startDate", startDate);
              spanParams.set("endDate", endDate);
              const spansRes = await fetch(
                `/api/projects/${projectId}/traces/${traceId}/spans?${spanParams.toString()}`
              );
              if (spansRes.ok) {
                const fetchedSpans = (await spansRes.json()) as TraceViewSpan[];
                if (fetchedSpans.length > 0) {
                  const live = get().traceSpans[traceId] ?? [];
                  // CH-wins: base = live (realtime), incoming = fetched with incomingWins.
                  get().setTraceSpans(traceId, mergeSpans(live, fetchedSpans, true));
                }
              }
            } catch {
              // Best-effort hydration — placeholder stats / realtime-fed spans remain on failure.
            }
          },

          setSessionName: (name) => set({ sessionName: name } as Partial<DebuggerSessionViewStore>),

          dismissNewTraceNotice: () => set({ newTraceNotice: false } as Partial<DebuggerSessionViewStore>),

          noteForTrace: (traceId) => {
            const row = get().traces.find((t) => t.id === traceId);
            const note = row?.metadata?.[NOTE_METADATA_KEY];
            return typeof note === "string" ? note : undefined;
          },

          getSpanType: (traceId, spanId) => get().traceSpans[traceId]?.find((s) => s.spanId === spanId)?.spanType,
        };
      },
      {
        // Distinct from `session-view-state` AND the parked `debugger-session-state`.
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
  storeKey?: string;
}

const DebuggerSessionViewStoreProvider = ({
  children,
  initialTraceRow,
  initialSessionName,
  storeKey,
}: PropsWithChildren<DebuggerSessionViewStoreProviderProps>) => {
  const [storeState] = useState(() =>
    createDebuggerSessionViewStore({ initialTraceRow, initialSessionName, storeKey })
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
