import { z } from "zod";

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
  data: Record<string, any>;
  target: Record<string, any>;
  metadata: Record<string, any> | null;
  indexedOn: string | null;
}

export const CreateDatapointsSchema = z.object({
  datapoints: z.array(
    z.object({
      data: z.any(),
      target: z.any().optional(),
      metadata: z.any().optional(),
    })
  ),
  sourceSpanId: z.string().optional(),
});
