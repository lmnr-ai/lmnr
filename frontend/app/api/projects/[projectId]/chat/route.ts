import { coreMessageSchema, streamText } from "ai";
import { z } from "zod";

import { getModel } from "@/lib/playground/providersRegistry";

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

    const parseResult = z.array(coreMessageSchema).min(1).safeParse(messages);

    if (!parseResult.success) {
      throw new Error("Messages doesn't match structure.");
    }

    const result = streamText({
      model: getModel(model, "api-key"),
      messages,
      maxTokens: 1024,
    });

    return result.toTextStreamResponse();
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Internal server error.",
        details: e instanceof Error ? e.name : "Unknown error",
      }),
      {
        status: 500,
      }
    );
  }
}
