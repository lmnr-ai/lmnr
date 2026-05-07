import { z } from "zod/v4";

import { generatePromptName } from "@/lib/actions/debugger-sessions/generate-name";
import { apiHandler } from "@/lib/api/api-handler";

const GenerateNameSchema = z.object({
  promptContent: z.string().min(1, "Prompt content is required"),
});

export const POST = apiHandler<{ projectId: string; sessionId: string }>(async (req, ctx) => {
  await ctx.params;
  const body = await req.json();
  const { promptContent } = GenerateNameSchema.parse(body);

  const result = await generatePromptName(promptContent);

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ name: result.name });
});
