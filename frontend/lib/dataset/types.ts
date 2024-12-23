export interface Dataset {
  id: string;
  createdAt?: string;
  name: string;
  indexedOn: string | null;
  itemsCount: number;
}

export interface Datapoint {
  id: string;
  createdAt: string;
  data: Record<string, any>;
  target: Record<string, any>;
  metadata: Record<string, any> | null;
  indexedOn: string | null;
}
