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
// streamed duplicates for the same spanId.
const mergeSpans = (base: TraceViewSpan[], incoming: TraceViewSpan[], incomingWins = true): TraceViewSpan[] => {
  const byId = new Map<string, TraceViewSpan>();
  for (const s of base) byId.set(s.spanId, s);
  for (const s of incoming) {
    const prev = byId.get(s.spanId);
    if (!prev) {
      byId.set(s.spanId, s);
      continue;
    }
    // Real spans always replace pending placeholders (whose endTime is synthesized
    // from children and can run ahead); a placeholder never replaces a real span.
    if (prev.pending !== s.pending) {
      if (prev.pending) byId.set(s.spanId, { ...s, collapsed: prev.collapsed });
      continue;
    }
    // Per-span recency: never let an older snapshot (e.g. a lagging CH hydrate)
    // replace a fresher version of the same span. endTime tie → side precedence.
    const prevEnd = new Date(prev.endTime).getTime();
    const incEnd = new Date(s.endTime).getTime();
    const incomingNewer = incEnd > prevEnd || (incEnd === prevEnd && incomingWins);
    if (incomingNewer) byId.set(s.spanId, { ...s, collapsed: prev.collapsed });
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
  traceFetchState: Record<string, "loading" | "loaded">;
  sessionName: string;

  // True when a run was added live via trace_update — drives the "New trace" pill
  // at the bottom of the view. Cleared on pill click / dismiss. Transient.
  newTraceNotice: boolean;

  // Prevents "New trace" pill from being shown on page load
  isInitialTracesLoaded: boolean;
}

interface DebuggerSessionViewActions {
  // Expand-path fetch override, gated on `traceFetchState` (NOT slot shape): if a
  // catch-up fetch already ran (loading/loaded) do nothing; if idle (a list row
  // never expanded) fetch once via the base slice, owning `traceFetchState` so the
  // debugger UI reads ONE source. Idempotent.
  ensureTraceSpans: (trace: TraceRow) => Promise<void>;

  // Fetch this session's runs (traces) via the `rollout.session_id` metadata
  // filter, oldest-first, into base `traces`. Reads projectId from base state.
  fetchSessionTraces: (sessionId: string) => Promise<void>;

  // Realtime: upsert a streamed span into its (already-loaded) trace.
  applyRealtimeSpan: (span: RealtimeSpan) => void;

  // Realtime: batch entry point for a span_update payload (one store call per event).
  applyRealtimeSpans: (spans: RealtimeSpan[]) => void;

  // Realtime: merge a trace_update into the run list (add + auto-expand if new).
  applyTraceUpdate: (t: { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }) => void;

  // Realtime: batch entry point for a trace_update payload (one store call per event).
  applyTraceUpdates: (traces: { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }[]) => void;

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

export const createDebuggerSessionViewStore = (options?: {
  initialTraceRow?: TraceRow;
  initialSessionName?: string;
  projectId?: string;
  storeKey?: string;
}) =>
  createStore<DebuggerSessionViewStore>()(
    persist(
      (set, get) => {
        const baseSlice = createBaseSessionViewSlice<DebuggerSessionViewStore>(set, get, {});

        return {
          ...baseSlice,

          // Seeded at store creation (projectId is static for the page) instead of
          // synced from the URL param in an effect.
          projectId: options?.projectId,

          // Seed base `traces` with the single /alpha trace when provided.
          traces: options?.initialTraceRow ? [options.initialTraceRow] : [],

          sessionName: options?.initialSessionName ?? "Session",
          traceFetchState: {},
          newTraceNotice: false,
          isInitialTracesLoaded: false,

          ensureTraceSpans: async (trace) => {
            // State-based idempotence (never shape-based): if a catch-up fetch is in
            // flight or already settled, do nothing — spans stream in independently
            // and the recency merge keeps them correct. Only an idle (never-fetched)
            // list row reaches the fetch below.
            const fetchState = get().traceFetchState[trace.id];
            if (fetchState === "loading" || fetchState === "loaded") return;

            // Set "loading" synchronously (before any await) so a span streaming in
            // between this set and the fetch settling can never flash "No spans
            // found" — this is the exact P1 race class. The debugger segment UI
            // reads ONLY `traceFetchState`; the base slice's `traceSpansLoading`
            // stays untouched for the regular session view.
            //
            // AbortController stance (decided): no abort plumbing. Per-trace fetches
            // fire once (state-guarded above), late responses are harmless through the
            // recency merge, and the store is recreated per session (provider keyed by
            // sessionId). Zustand vanilla has no dispose hook to hang a controller off,
            // so we skip it entirely rather than invent lifecycle.
            set(
              (s) =>
                ({
                  traceFetchState: { ...s.traceFetchState, [trace.id]: "loading" },
                }) as Partial<DebuggerSessionViewStore>
            );
            try {
              // Fetch directly instead of delegating to baseSlice.ensureTraceSpans:
              // the base guard is shape-based (`if (traceSpans[id])`) and spans now
              // upsert unconditionally, so an active run that streamed even one SSE
              // span before first expand would make the base skip the ClickHouse
              // historical fetch entirely. Merge fetched-wins so duplicates resolve
              // to the fuller CH span; streamed-only spans are preserved.
              const { projectId } = get();
              if (!projectId) return;
              const spanParams = new URLSearchParams();
              spanParams.append("searchIn", "input");
              spanParams.append("searchIn", "output");
              spanParams.set("startDate", new Date(new Date(trace.startTime).getTime() - 1000).toISOString());
              spanParams.set("endDate", new Date(new Date(trace.endTime).getTime() + 1000).toISOString());
              const res = await fetch(`/api/projects/${projectId}/traces/${trace.id}/spans?${spanParams.toString()}`);
              if (res.ok) {
                const fetchedSpans = (await res.json()) as TraceViewSpan[];
                if (fetchedSpans.length > 0) {
                  get().setTraceSpans(trace.id, mergeSpans(get().traceSpans[trace.id] ?? [], fetchedSpans, true));
                }
              }
            } catch {
              // Best-effort, same semantics as hydrateTraceRow: failure still reaches
              // "loaded"; the UI shows whatever streamed.
            } finally {
              set(
                (s) =>
                  ({
                    traceFetchState: { ...s.traceFetchState, [trace.id]: "loaded" },
                  }) as Partial<DebuggerSessionViewStore>
              );
            }
          },

          fetchSessionTraces: async (sessionId) => {
            const { projectId } = get();
            if (!projectId) return;

            get().setIsTracesLoading(true);
            get().setTracesError(undefined);
            try {
              const params = new URLSearchParams();
              params.set("pageNumber", "0");
              params.set("pageSize", String(MAX_RUNS));
              // DESC so a session with > MAX_RUNS runs keeps the NEWEST window;
              // the display sort below restores oldest-first within it.
              params.set("sortDirection", "DESC");
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
              // API returned newest-first; display order is oldest-first.
              const sorted = normalized.sort(
                (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
              );
              // MERGE with current rows instead of replacing: a run that started while
              // this fetch was in flight was added by applyTraceUpdate but is absent
              // from the (CH-lagged) response — replacing wholesale wipes its row and
              // its streamed spans. Fetched rows win per-id (richer stats) but keep the
              // live row's merged metadata + realtime-bumped endTime (same semantics as
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
              // Mark hydrated even on error: a failed initial fetch shouldn't leave the
              // pill permanently suppressed — subsequent live runs are genuinely new.
              set({ isInitialTracesLoaded: true } as Partial<DebuggerSessionViewStore>);
            }
          },

          applyRealtimeSpan: (span) => {
            const traceId = span.traceId;
            const tvSpan = realtimeToTraceViewSpan(span);

            // Unconditional upsert into the dumb spans map (create the array if absent).
            // Spans and trace rows are independent streams — a span can arrive before
            // its trace_update creates the row, which is fine: the recency-aware merge
            // dedupes by spanId, and the segment renders whatever the map holds. No
            // buffer, no conditions; this is what kills the old "(no spans)" race.
            get().setTraceSpans(traceId, mergeSpans(get().traceSpans[traceId] ?? [], [tvSpan]));

            // Bump the owning trace row's endTime when the span extends past it (keeps
            // list stats/ordering correct for a live run). Find the row FIRST and only
            // rebuild `traces` when the endTime actually moves — otherwise every streamed
            // span would mint a new array identity and bust every derived memo
            // (previewTraces, traceIds, allSpansById, …) for no change (finding #6). No-op
            // if the row doesn't exist yet — endTime is seeded from trace_update / hydrate.
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
            const existing = get().traces.find((row) => row.id === t.traceId);

            if (!existing) {
              // Unknown run → add a lightweight row (placeholder stats) to the ordering.
              // Any spans that raced ahead of this event are already in `traceSpans`
              // (applyRealtimeSpan upserts unconditionally) — nothing to seed or flush.
              get().setTraces((traces) => [...traces, minimalTraceRow(t.traceId, metadata)]);
              // Kick the catch-up fetch FIRST so it sets traceFetchState="loading"
              // synchronously; setTraceExpanded then triggers the ensureTraceSpans
              // override, which sees "loading" and short-circuits — one fetch, not two.
              // hydrateTraceRow owns this trace's traceFetchState lifecycle.
              void get().hydrateTraceRow(t.traceId);
              get().setTraceExpanded(t.traceId, true);
              // Surface the "New trace" pill so the user can jump to the new run — but
              // only once the initial fetch has settled, so a trace_update that beat the
              // first fetch (for a run already in the initial set) can't flash it on load.
              if (get().isInitialTracesLoaded) set({ newTraceNotice: true } as Partial<DebuggerSessionViewStore>);
              return;
            }

            // Known run → merge metadata (makes live note updates work: `rollout.note`
            // arrives here after a POST /v1/traces/metadata patch) AND any non-metadata
            // fields the payload carries (e.g. hasBrowserSession). Bail only when there
            // is genuinely nothing to apply, so a browser-session signal isn't dropped
            // just because the metadata happened to be empty (finding #10).
            const hasMetadata = Object.keys(metadata).length > 0;
            const hasBrowserSession = typeof t.hasBrowserSession === "boolean";
            if (!hasMetadata && !hasBrowserSession) return;
            get().setTraces((traces) =>
              traces.map((row) =>
                row.id === t.traceId
                  ? {
                      ...row,
                      ...(hasMetadata && { metadata: { ...row.metadata, ...metadata } }),
                      ...(hasBrowserSession && { hasBrowserSession: t.hasBrowserSession }),
                    }
                  : row
              )
            );
          },

          applyTraceUpdates: (traces) => {
            for (const t of traces) get().applyTraceUpdate(t);
          },

          hydrateTraceRow: async (traceId) => {
            const { projectId } = get();
            if (!projectId) return;
            // State-based idempotence (never shape-based): if a catch-up fetch already
            // ran or is running for this trace, don't re-fetch. This replaces the old
            // `startTime !== endTime` shape check that the P1 race defeated (a streamed
            // span bumped endTime past startTime before this ran, so the guard passed
            // and the flag-clear in finally was skipped → stuck skeleton).
            if (get().traceFetchState[traceId]) return;

            // hydrateTraceRow is the sole owner of traceFetchState. Set "loading" in
            // the SYNCHRONOUS prefix (before ANY await) — this is the exact P1 trap:
            // a span streaming in between this call and the fetch settling must never
            // flash "No spans found" before the skeleton is shown.
            set(
              (s) =>
                ({
                  traceFetchState: { ...s.traceFetchState, [traceId]: "loading" },
                }) as Partial<DebuggerSessionViewStore>
            );
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
              // Best-effort hydration — placeholder stats / realtime-fed spans remain on
              // failure. HYDRATE-FAILURE SEMANTICS (decided): a failed fetch still reaches
              // "loaded" below — the UI shows whatever spans streamed (or "No spans found"
              // if none). We do NOT retry: the state-based idempotence guard means a
              // re-expand won't re-fetch. Kept simple per spec; if a failed run needs a
              // retry affordance later, surface a manual refresh rather than auto-retry.
            } finally {
              // "loaded" unconditionally (success OR failure) — the skeleton must always
              // resolve. This is the structural fix for the stuck-skeleton P1: there is no
              // early-return path that can skip this finally.
              set(
                (s) =>
                  ({
                    traceFetchState: { ...s.traceFetchState, [traceId]: "loaded" },
                  }) as Partial<DebuggerSessionViewStore>
              );
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
  const { projectId } = useParams<{ projectId: string }>();
  const [storeState] = useState(() =>
    createDebuggerSessionViewStore({ initialTraceRow, initialSessionName, projectId, storeKey })
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
