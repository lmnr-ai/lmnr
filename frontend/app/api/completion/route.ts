import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

export async function POST(req: Request) {
  const { prompt }: { prompt: string } = await req.json();

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const { text } = await generateText({
    model: openai("gpt-4"),
    system: "You are a helpful assistant.",
    prompt,
  });

  return Response.json({ text });
}
