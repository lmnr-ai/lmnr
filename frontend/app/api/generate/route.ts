// Allow streaming responses up to 30 seconds
import { streamText } from "ai";

import { getModel } from "@/lib/playground/providersRegistry";

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

    const result = streamText({
      model: getModel(model, "api-key"),
      messages,
      maxTokens: 1024,
    });

    if (!result) {
      throw new Error("No stream returned from model");
    }

    return result.toTextStreamResponse();
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "Failed to generate response",
        details: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
      }
    );
  }
}
