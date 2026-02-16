// Event stored as a tuple on the spans table: Array(Tuple(timestamp Int64, name String, attributes String))
export type SpanEvent = {
  timestamp: number;
  name: string;
  attributes: Record<string, any>;
};

// Event from signals (`signal_events` table)
export type EventRow = {
  id: string;
  signalId: string;
  traceId: string;
  payload: string;
  timestamp: string;
};
