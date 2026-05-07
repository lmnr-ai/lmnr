import { z } from "zod/v4";

import { generateSql } from "@/lib/actions/sql/generate";
import { apiHandler } from "@/lib/api/api-handler";

const GenerateSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  mode: z.enum(["query", "eval-expression"]).optional(),
  currentQuery: z.string().optional(),
});

export const POST = apiHandler<{ projectId: string }>(async (request, ctx) => {
  await ctx.params;
  const body = await request.json();
  const { prompt, mode, currentQuery } = GenerateSchema.parse(body);

  const result = await generateSql(prompt, mode, currentQuery);

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ query: result.result });
});
