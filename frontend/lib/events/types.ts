export enum EventType {
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
  NUMBER = 'NUMBER'
}

export type EventTemplate = {
  id: string;
  createdAt: string;
  name: string;
  eventType: EventType;
  projectId: string;
  latestTimestamp: string | null;
};

export type Event = {
  id: string;
  spanId: string;
  timestamp: string;
  templateId: string;
  templateName: string;
  templateEventType: EventType;
  source: string;
  value: string | number | boolean | null;
  metadata: Record<string, string> | null;
  inputs: Record<string, any> | null;
};
