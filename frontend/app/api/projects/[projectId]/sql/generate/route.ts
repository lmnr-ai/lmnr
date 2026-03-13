import { z } from "zod/v4";

import { generateSql } from "@/lib/actions/sql";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

const GenerateSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  mode: z.enum(["query", "eval-expression"]).optional(),
  currentQuery: z.string().optional(),
});

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, _params) => {
  const body = await req.json();
  const { prompt, mode, currentQuery } = GenerateSchema.parse(body);

  const result = await generateSql(prompt, mode, currentQuery);

  if (!result.success) {
    throw new HttpError(result.error, 400);
  }

  return { query: result.result };
});
