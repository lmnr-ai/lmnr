import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types.ts";

const GetSignalRunsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  signalId: z.string(),
});

type SignalRun = {
  projectId: string;
  signalId: string;
  jobId: string;
  runId: string;
  status: number;
  eventId: string;
  errorMessages?: string;
  updatedAt: string;
};

export type SignalRunRow = Pick<SignalRun, "jobId" | "runId" | "status" | "eventId" | "errorMessages" | "updatedAt">;

export const getSignalRuns = (input: z.infer<typeof GetSignalRunsSchema>) => {
  const { projectId, pageSize, pageNumber, pastHours, startDate, endDate, filter, signalId } = input;

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);
};
