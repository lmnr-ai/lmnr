import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { handleRoute } from "@/lib/api/route-handler";
import { db } from "@/lib/db/drizzle";
import { playgrounds } from "@/lib/db/migrations/schema";

const updatePlaygroundSchema = z.object({
  promptMessages: z.array(z.any()),
  modelId: z.string(),
  outputSchema: z.string().optional(),
  tools: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  providerOptions: z.record(z.string(), z.any()).optional(),
  toolChoice: z
    .string()
    .or(z.object({ type: z.string(), toolName: z.string().optional() }).optional())
    .optional(),
});

export const POST = handleRoute<{ projectId: string; playgroundId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  const parsed = updatePlaygroundSchema.safeParse(body);

  if (!parsed.success) {
    throw parsed.error;
  }

  const res = await db
    .update(playgrounds)
    .set({
      tools: parsed.data.tools,
      toolChoice: parsed.data.toolChoice,
      promptMessages: parsed.data.promptMessages,
      modelId: parsed.data.modelId,
      outputSchema: parsed.data.outputSchema ?? null,
      temperature: parsed.data.temperature,
      maxTokens: parsed.data.maxTokens,
      providerOptions: parsed.data.providerOptions,
    })
    .where(eq(playgrounds.id, params.playgroundId))
    .returning();

  return res;
});
