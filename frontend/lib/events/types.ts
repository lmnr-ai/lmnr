// Event from spans (old `events` table)
export type Event = {
  id: string;
  projectId: string;
  spanId: string;
  timestamp: string;
  name: string;
  attributes: Record<string, any>;
};

// Event from signals (`signal_events` table)
export type EventRow = {
  id: string;
  signalId: string;
  traceId: string;
  runId: string;
  name: string;
  payload: string;
  timestamp: string;
};
