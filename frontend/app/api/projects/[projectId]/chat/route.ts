import { coreMessageSchema, streamText } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { decodeApiKey } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { providerApiKeys } from "@/lib/db/migrations/schema";
import { Provider, providerToApiKey } from "@/lib/pipeline/types";
import { getModel } from "@/lib/playground/providersRegistry";

export async function POST(req: Request) {
  try {
    const { messages, model, projectId } = await req.json();

    const parseResult = z.array(coreMessageSchema).min(1).safeParse(messages);

    if (!parseResult.success) {
      throw new Error(`Messages doesn't match structure: ${parseResult.error}`);
    }

    const provider = model.split(":")[0] as Provider;

    const apiKeyName = providerToApiKey[provider];

    const [key] = await db
      .select({
        value: providerApiKeys.value,
        nonceHex: providerApiKeys.nonceHex,
        name: providerApiKeys.name,
        createdAt: providerApiKeys.createdAt,
      })
      .from(providerApiKeys)
      .where(and(eq(providerApiKeys.projectId, projectId), eq(providerApiKeys.name, apiKeyName)));

    if (!key) {
      throw new Error("No matching key found.");
    }

    const decodedKey = await decodeApiKey(key.name, key.nonceHex, key.value);

    const result = streamText({
      model: getModel(model, decodedKey),
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
