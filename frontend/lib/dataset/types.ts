export interface Dataset {
  id: string;
  createdAt?: string;
  name: string;
  indexedOn: string | null;
}

export interface DatasetInfo extends Dataset {
  datapointsCount: number;
}

export interface Datapoint {
  id: string;
  createdAt: string;
  data: string;
  target: string;
  metadata: string;
  indexedOn: string | null;
}
