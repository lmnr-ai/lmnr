import { z } from "zod/v4";

import { generatePromptName } from "@/lib/actions/debugger-sessions/generate-name";
import { handleRoute } from "@/lib/api/route-handler";

const GenerateNameSchema = z.object({
  promptContent: z.string().min(1, "Prompt content is required"),
});

export const POST = handleRoute<{ projectId: string; sessionId: string }, unknown>(async (req) => {
  const body = await req.json();
  const { promptContent } = GenerateNameSchema.parse(body);

  const result = await generatePromptName(promptContent);

  if (!result.success) {
    throw new Error(result.error);
  }

  return { name: result.name };
});
