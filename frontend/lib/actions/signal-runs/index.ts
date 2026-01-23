import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";

import { buildSignalRunsQueryWithParams } from "./utils";

export const GetSignalRunsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  signalId: z.string(),
});

export type SignalRun = {
  projectId: string;
  signalId: string;
  jobId: string;
  triggerId: string;
  runId: string;
  status: number;
  eventId: string;
  errorMessage?: string;
  updatedAt: string;
};

export type SignalRunRow = Pick<
  SignalRun,
  "jobId" | "runId" | "triggerId" | "status" | "eventId" | "errorMessage" | "updatedAt"
>;

export const getSignalRuns = async (input: z.infer<typeof GetSignalRunsSchema>) => {
  const { projectId, pageSize, pageNumber, pastHours, startDate, endDate, filter, signalId } = input;

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const { query: mainQuery, parameters: mainParams } = buildSignalRunsQueryWithParams({
    signalId,
    filters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
  });

  const items = await executeQuery<SignalRunRow>({
    query: mainQuery,
    parameters: mainParams,
    projectId,
  });

  return {
    items,
  };
};
