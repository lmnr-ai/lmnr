import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { playgrounds } from "@/lib/db/migrations/schema";

const updatePlaygroundSchema = z.object({
  promptMessages: z.array(z.any()),
  modelId: z.string(),
  outputSchema: z.string().optional(),
  tools: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  providerOptions: z.record(z.any()).optional(),
  toolChoice: z
    .string()
    .or(z.object({ type: z.string(), toolName: z.string().optional() }).optional())
    .optional(),
});

export async function POST(req: Request, props: { params: Promise<{ projectId: string; playgroundId: string }> }) {
  const params = await props.params;
  const body = await req.json();

  const parsed = updatePlaygroundSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.errors }), {
      status: 400,
    });
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

  return new Response(JSON.stringify(res));
}
