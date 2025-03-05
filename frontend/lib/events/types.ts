export enum EventType {
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
  NUMBER = 'NUMBER'
}

export type Event = {
  id: string;
  spanId: string;
  projectId: string;
  timestamp: string;
  name: string;
  attributes: Record<string, any>;
};
