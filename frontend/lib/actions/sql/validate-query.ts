import { z } from "zod/v4";

import { fetcherJSON } from "@/lib/utils";

import { resolveSqlActor, type SqlActor } from "./actor";

export const ValidateQuerySchema = z.object({
  projectId: z.guid(),
  query: z.string().min(1, "SQL query is required"),
});

export interface QueryValidationResult {
  success: boolean;
  validatedQuery?: string;
  error?: string;
}

/**
 * The validated SQL embeds the caller's read policy (it is what export jobs
 * later execute), so validation is actor-scoped like `executeQuery`.
 */
export async function validateQuery(
  input: z.infer<typeof ValidateQuerySchema>,
  options?: { actor?: SqlActor }
): Promise<QueryValidationResult> {
  const { projectId, query } = ValidateQuerySchema.parse(input);
  const actor = await resolveSqlActor(options?.actor);

  const json = await fetcherJSON(`/projects/${projectId}/sql/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      actor,
    }),
  });

  return json;
}
