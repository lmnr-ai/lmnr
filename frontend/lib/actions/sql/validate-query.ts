import { z } from "zod";

import { fetcherJSON } from "@/lib/utils";

export const ValidateQuerySchema = z.object({
  projectId: z.string(),
  query: z.string().min(1, "SQL query is required"),
});

export interface QueryValidationResult {
  success: boolean;
  validatedQuery?: string;
  error?: string;
}

export async function validateQuery(input: z.infer<typeof ValidateQuerySchema>): Promise<QueryValidationResult> {
  const { projectId, query } = ValidateQuerySchema.parse(input);

  const json = await fetcherJSON(`/projects/${projectId}/sql/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
    }),
  });

  return json;
}
