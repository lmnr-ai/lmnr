import { z } from "zod/v4";

import { fetcherJSON } from "@/lib/utils";

export * from "./export-job";
export * from "./templates";

const ExecuteQuerySchema = z.object({
  projectId: z.string(),
  query: z.string().min(1, { error: "Query is required." }),
  parameters: z
    .looseObject({
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      interval_unit: z.string().optional(),
    })
    .optional(),
});

export const executeQuery = async <T extends Record<string, unknown>>(input: z.infer<typeof ExecuteQuerySchema>) => {
  const { parameters, query, projectId } = ExecuteQuerySchema.parse(input);

  const res = (await fetcherJSON(`/projects/${projectId}/sql/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, parameters }),
  })) as T[];

  return res;
};
