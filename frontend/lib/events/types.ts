export enum EventType {
  BOOLEAN = "BOOLEAN",
  STRING = "STRING",
  NUMBER = "NUMBER",
}

export type EventTemplate = {
  id: string;
  createdAt: string;
  name: string;
  description: string | null;
  instruction: string | null;
  eventType: EventType;
  domain: string[] | number[] | null;
}

export type Event = {
  id: string;
  spanId: string;
  timestamp: string;
  templateId: string;
  templateName: string;
  source: string;
  value: string | number | null;
  metadata: Record<string, string> | null;
}