import { applyTracePartial, mergeTraceDelta, realtimeTraceToRow } from "@/lib/traces/realtime";
import { type RealtimeTracePayload, type TraceRow } from "@/lib/traces/types";

const byStartTime = (a: TraceRow, b: TraceRow) => Date.parse(a.startTime) - Date.parse(b.startTime);

/** Fetched rows win; live turns the fetch doesn't have yet (ClickHouse lags the stream) stay. */
export const mergeFetched = (local: TraceRow[], fetched: TraceRow[], live: ReadonlySet<string>): TraceRow[] => {
  const fetchedIds = new Set(fetched.map((t) => t.id));
  const pending = local.filter((t) => live.has(t.id) && !fetchedIds.has(t.id));
  return pending.length === 0 ? fetched : [...fetched, ...pending].sort(byStartTime);
};

/** Folds one `trace_update` batch into the session's rows: known traces merge, new ones become turns. */
export const applyTraceDeltas = (rows: TraceRow[], deltas: RealtimeTracePayload[]): TraceRow[] => {
  const next = [...rows];
  for (const delta of deltas) {
    const i = next.findIndex((t) => t.id === delta.id);
    if (i >= 0) next[i] = mergeTraceDelta(next[i], delta);
    else next.push(realtimeTraceToRow(delta));
  }
  return next.sort(byStartTime);
};

/** The server sends a trace's input after its first delta, so an unknown trace has nothing to attach it to. */
export const applyAgentInput = (rows: TraceRow[], traceId: string, agentInput: unknown): TraceRow[] =>
  rows.some((t) => t.id === traceId)
    ? rows.map((t) => (t.id === traceId ? applyTracePartial(t, { agentInput }) : t))
    : rows;

export type TurnReply =
  | { status: "loading" }
  | { status: "writing" }
  | { status: "text"; text: string }
  | { status: "none" }
  | { status: "failed" };

/** What the thread shows for a turn's reply. A live turn is still being written, so its reply isn't loaded yet. */
export const replyOf = (live: boolean, text: string | null | undefined, failed: boolean): TurnReply => {
  if (live) return { status: "writing" };
  if (failed) return { status: "failed" };
  if (text === undefined) return { status: "loading" };
  return text ? { status: "text", text } : { status: "none" };
};
