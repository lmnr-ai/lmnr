import { type RealtimeTracePayload, type SessionRow } from "@/lib/traces/types";

/**
 * Folds the project's per-batch trace deltas into session rows, so a session appears and its totals move the moment
 * a batch is ingested. Deltas are additive per batch; what a delta can't say is whether its trace was already counted
 * in the loaded row (a trace in flight when the page loaded). Those fields are best-effort until `mergeRefreshedPage`
 * swaps in a server row that has caught up.
 */
export interface LiveSessions {
  rows: SessionRow[];
  /** Each trace seen live: its session and the time window seen so far (ms), for trace count and duration. */
  traces: Record<string, { sessionId: string; start: number; end: number }>;
  /** Agent input that arrived before its trace's first delta. */
  pendingInputs: Record<string, string>;
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const iso = (time: number) => new Date(time).toISOString();
const windowSeconds = (w: { start: number; end: number }) =>
  Number.isFinite(w.end - w.start) ? (w.end - w.start) / 1000 : 0;

const emptyRow = (sessionId: string): SessionRow => ({
  id: sessionId,
  sessionId,
  subRows: [],
  traceCount: 0,
  startTime: "",
  endTime: "",
  duration: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadInputTokens: 0,
  inputCost: 0,
  outputCost: 0,
  totalCost: 0,
});

const minIso = (a: string, b: number) => (!Number.isFinite(b) || (a && ms(a) <= b) ? a : iso(b));
const maxIso = (a: string, b: number) => (!Number.isFinite(b) || (a && ms(a) >= b) ? a : iso(b));

export const applyTraceDelta = (state: LiveSessions, delta: RealtimeTracePayload): LiveSessions => {
  const sessionId = delta.sessionId;
  if (!sessionId) return state;

  const seen = state.traces[delta.id];
  const start = ms(delta.startTime);
  const end = ms(delta.endTime);
  const before = seen ?? { sessionId, start: NaN, end: NaN };
  const after = {
    sessionId,
    start: Number.isFinite(before.start) && !(start < before.start) ? before.start : start,
    end: Number.isFinite(before.end) && !(end > before.end) ? before.end : end,
  };

  const i = state.rows.findIndex((r) => r.sessionId === sessionId);
  const row = i >= 0 ? state.rows[i] : emptyRow(sessionId);
  const input = state.pendingInputs[delta.id];
  const next: SessionRow = {
    ...row,
    traceCount: (row.traceCount ?? 0) + (seen ? 0 : 1),
    startTime: minIso(row.startTime, start),
    endTime: maxIso(row.endTime, end),
    duration: row.duration + windowSeconds(after) - windowSeconds(before),
    inputTokens: row.inputTokens + delta.inputTokens,
    outputTokens: row.outputTokens + delta.outputTokens,
    totalTokens: row.totalTokens + delta.totalTokens,
    cacheReadInputTokens: (row.cacheReadInputTokens ?? 0) + delta.cacheReadInputTokens,
    inputCost: row.inputCost + delta.inputCost,
    outputCost: row.outputCost + delta.outputCost,
    totalCost: row.totalCost + delta.totalCost,
    userId: row.userId ?? delta.userId ?? undefined,
    firstInput: row.firstInput || input,
  };

  // A session not on screen is new (or older than the loaded pages); either way it's the most recent activity.
  const rows = i >= 0 ? state.rows.with(i, next) : [next, ...state.rows];
  const pendingInputs = input === undefined ? state.pendingInputs : omit(state.pendingInputs, delta.id);
  return { rows, traces: { ...state.traces, [delta.id]: after }, pendingInputs };
};

/** A session's first input is its first trace's; a live trace only fills a row that has none yet. */
export const applyAgentInput = (state: LiveSessions, traceId: string, agentInput: unknown): LiveSessions => {
  const text = typeof agentInput === "string" ? agentInput : JSON.stringify(agentInput);
  const seen = state.traces[traceId];
  if (!seen) return { ...state, pendingInputs: { ...state.pendingInputs, [traceId]: text } };
  const i = state.rows.findIndex((r) => r.sessionId === seen.sessionId);
  if (i < 0 || state.rows[i].firstInput) return state;
  return { ...state, rows: state.rows.with(i, { ...state.rows[i], firstInput: text }) };
};

/**
 * Corrects the rows on screen with a refetched first page. It never adds, drops or moves rows (live updates own
 * those), and ClickHouse can lag the stream, so a server row replaces a live one only once it has caught up to it.
 */
export const mergeRefreshedPage = (rows: SessionRow[], page: SessionRow[]): SessionRow[] => {
  const server = new Map(page.map((r) => [r.sessionId, r]));
  return rows.map((local) => {
    const fresh = server.get(local.sessionId);
    return fresh && ms(fresh.endTime) >= ms(local.endTime) ? fresh : local;
  });
};

const omit = <V>(record: Record<string, V>, key: string) => {
  const next = { ...record };
  delete next[key];
  return next;
};
