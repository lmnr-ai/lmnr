import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { playgrounds } from "@/lib/db/migrations/schema";

const updatePlaygroundSchema = z.object({
  promptMessages: z.array(z.any()),
  modelId: z.string(),
  outputSchema: z.string().optional()
});

export async function POST(req: Request, { params }: { params: { projectId: string; playgroundId: string } }) {
  const body = await req.json();

  const parsed = updatePlaygroundSchema.safeParse(body);

  if (!parsed.success) {
    console.log(parsed.error.errors);
    return new Response(JSON.stringify({ error: parsed.error.errors }), {
      status: 400
    });
  }

  const res = await db.update(playgrounds).set({
    promptMessages: parsed.data.promptMessages,
    modelId: parsed.data.modelId,
    outputSchema: parsed.data.outputSchema ?? null
  })
    .where(eq(playgrounds.id, params.playgroundId))
    .returning();

  return new Response(JSON.stringify(res));
}
