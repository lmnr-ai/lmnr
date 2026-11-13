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

/**
 * Fills in live agent inputs the rows don't carry: the input is its own message, so it can beat the turn's first
 * delta, and a fetch can land before ClickHouse has it. A row's own input wins.
 */
export const withLiveInputs = (rows: TraceRow[], inputs: Readonly<Record<string, unknown>>): TraceRow[] =>
  Object.keys(inputs).length === 0
    ? rows
    : rows.map((t) => (t.agentInput || !(t.id in inputs) ? t : applyTracePartial(t, { agentInput: inputs[t.id] })));

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
