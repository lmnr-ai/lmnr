import { applyTracePartial, mergeTraceDelta, realtimeTraceToRow } from "@/lib/traces/realtime";
import { type RealtimeTracePayload, type TraceRow } from "@/lib/traces/types";

/**
 * A live session is a server snapshot of its traces plus a stream of per-batch deltas. Deltas are numbered; a snapshot
 * remembers the number current when it was requested, so it is authoritative only for what happened before that.
 */
export interface SyncState {
  status: "loading" | "ready" | "error";
  error?: string;
  traces: TraceRow[];
  /** Number of the last delta applied. */
  seq: number;
  /** Number of the last delta per trace. */
  traceSeq: Record<string, number>;
  /** Deltas up to this number are reflected in the latest snapshot. */
  coveredSeq: number;
  /** Agent input extracted before its trace's first delta, applied when the row appears. */
  earlyInputs: Record<string, unknown>;
}

export type SyncEvent =
  | { type: "delta"; traces: RealtimeTracePayload[] }
  | { type: "agentInput"; traceId: string; agentInput: unknown }
  | { type: "snapshot"; traces: TraceRow[]; requestedAtSeq: number }
  | { type: "snapshotFailed"; error: string };

export const initialSyncState: SyncState = {
  status: "loading",
  traces: [],
  seq: 0,
  traceSeq: {},
  coveredSeq: 0,
  earlyInputs: {},
};

const byStartTime = (a: TraceRow, b: TraceRow) => Date.parse(a.startTime) - Date.parse(b.startTime);

const withEarlyInput = (row: TraceRow, earlyInputs: Record<string, unknown>): TraceRow =>
  row.id in earlyInputs && !row.agentInput ? applyTracePartial(row, { agentInput: earlyInputs[row.id] }) : row;

const without = (record: Record<string, unknown>, ids: Iterable<string>) => {
  const next = { ...record };
  for (const id of ids) delete next[id];
  return next;
};

export const applySyncEvent = (state: SyncState, event: SyncEvent): SyncState => {
  switch (event.type) {
    case "delta": {
      const seq = state.seq + 1;
      const traces = [...state.traces];
      const traceSeq = { ...state.traceSeq };
      const seeded: string[] = [];
      for (const delta of event.traces) {
        traceSeq[delta.id] = seq;
        const i = traces.findIndex((t) => t.id === delta.id);
        if (i >= 0) traces[i] = mergeTraceDelta(traces[i], delta);
        else {
          traces.push(withEarlyInput(realtimeTraceToRow(delta), state.earlyInputs));
          seeded.push(delta.id);
        }
      }
      return {
        ...state,
        seq,
        traceSeq,
        traces: traces.sort(byStartTime),
        earlyInputs: without(state.earlyInputs, seeded),
      };
    }

    case "agentInput": {
      const i = state.traces.findIndex((t) => t.id === event.traceId);
      if (i < 0) return { ...state, earlyInputs: { ...state.earlyInputs, [event.traceId]: event.agentInput } };
      const traces = [...state.traces];
      traces[i] = applyTracePartial(traces[i], { agentInput: event.agentInput });
      return { ...state, traces };
    }

    case "snapshot": {
      // The snapshot wins for the rows it has. Rows it predates (seen only in later deltas) stay until a newer
      // snapshot covers them; `needsReconcile` asks for that one.
      const fresh = new Set(event.traces.map((t) => t.id));
      const newer = state.traces.filter((t) => !fresh.has(t.id) && (state.traceSeq[t.id] ?? 0) > event.requestedAtSeq);
      // Agent input is extracted asynchronously and doesn't move `seq`, so a snapshot read before extraction would
      // erase input already shown; keep it.
      const previous = new Map(state.traces.map((t) => [t.id, t]));
      const fromSnapshot = event.traces.map((t) => {
        const known = previous.get(t.id)?.agentInput;
        return t.agentInput || !known ? withEarlyInput(t, state.earlyInputs) : { ...t, agentInput: known };
      });
      const traces = [...fromSnapshot, ...newer].sort(byStartTime);
      return {
        ...state,
        status: "ready",
        error: undefined,
        traces,
        coveredSeq: Math.max(state.coveredSeq, event.requestedAtSeq),
        earlyInputs: without(state.earlyInputs, fresh),
      };
    }

    case "snapshotFailed":
      // A failed refresh keeps the live rows; only a failed first load is an error.
      return state.status === "loading" ? { ...state, status: "error", error: event.error } : state;
  }
};

/** A turn is live while it has deltas newer than the latest snapshot. */
export const isLive = (state: SyncState, traceId: string) => (state.traceSeq[traceId] ?? 0) > state.coveredSeq;

/** Deltas arrived that no snapshot reflects yet. */
export const needsReconcile = (state: SyncState) => state.seq > state.coveredSeq;

/** A turn's reply as loaded from the batch output route. */
export type ReplyEntry = { kind: "loaded"; text: string | null } | { kind: "failed" };

export type TurnReply =
  | { status: "loading" }
  | { status: "writing" }
  | { status: "text"; text: string }
  | { status: "none" }
  | { status: "failed" };

/** What the thread shows for a turn's reply. A live turn's missing reply is still being written, not absent. */
export const replyOf = (entry: ReplyEntry | undefined, live: boolean): TurnReply => {
  if (entry?.kind === "loaded" && entry.text) return { status: "text", text: entry.text };
  if (live) return { status: "writing" };
  if (entry?.kind === "failed") return { status: "failed" };
  if (entry?.kind === "loaded") return { status: "none" };
  return { status: "loading" };
};
