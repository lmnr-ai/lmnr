import { z } from "zod/v4";

import { fetcherJSON } from "@/lib/utils";

export * from "./export-job";
export * from "./templates";

const ExecuteQuerySchema = z.object({
  projectId: z.string(),
  query: z.string().min(1, { error: "Query is required." }),
  apiKey: z.string().min(1, { error: "API key is required" }),
  parameters: z
    .object({
      start_time: z.string().optional(),
      end_time: z.string().optional(),
    })
    .optional(),
});

export const executeQuery = async <T extends Record<string, unknown>>(input: z.infer<typeof ExecuteQuerySchema>) => {
  const { parameters, query, projectId, apiKey } = ExecuteQuerySchema.parse(input);

  const res = (await fetcherJSON(`/projects/${projectId}/sql/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, parameters }),
  })) as T[];

  return res;
};
