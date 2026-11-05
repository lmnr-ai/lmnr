import { z } from "zod/v4";

import { callAppServer } from "@/lib/api/backend";

import { resolveSqlActor, type SqlActor } from "./actor";
import { type SqlQuerySource } from "./index";

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
  options: { source: SqlQuerySource; actor?: SqlActor }
): Promise<QueryValidationResult> {
  const { projectId, query } = ValidateQuerySchema.parse(input);
  const actor = await resolveSqlActor(options.actor);

  const json = await callAppServer(`/projects/${projectId}/sql/validate`, {
    method: "POST",
    body: {
      query,
      actor,
      source: options.source,
    },
  });

  return json;
}
