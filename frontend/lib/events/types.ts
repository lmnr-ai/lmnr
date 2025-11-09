export type Event = {
  id: string;
  spanId: string;
  projectId: string;
  timestamp: string;
  name: string;
  attributes: Record<string, any>;
};

export type EventRow = {
  id: string;
  projectId: string;
  spanId: string;
  traceId: string;
  timestamp: string;
  attributes: string;
  userId: string;
  sessionId: string;
  sizeBytes: number;
};
