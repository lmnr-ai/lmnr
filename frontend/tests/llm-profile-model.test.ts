import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { generateText } from "ai";

import { type LlmProfileConfig, LlmProfileConfigSchema } from "@/lib/actions/llm-profiles/schema";
import { languageModelFromProfile } from "@/lib/ai/profile-model";

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

const realFetch = globalThis.fetch;

function stubFetch(reply: unknown): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  };
  return calls;
}

const RESPONSES_REPLY = {
  id: "resp_1",
  created_at: 1790000000,
  model: "gw-model",
  status: "completed",
  output: [
    {
      type: "message",
      id: "msg_1",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "OK", annotations: [] }],
    },
  ],
  usage: { input_tokens: 1, output_tokens: 1 },
  incomplete_details: null,
};

const CHAT_REPLY = {
  id: "chat_1",
  created: 1790000000,
  model: "gw-model",
  choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
};

const customProfile = (apiShape?: "chat_completions" | "responses"): LlmProfileConfig =>
  LlmProfileConfigSchema.parse({
    provider: "custom",
    config: { baseUrl: "https://gw.example.com/v1", apiShape, headerNames: ["X-Tenant"], auth: { type: "api_key" } },
  });

const secrets = { apiKey: "sk-gw", headers: { "X-Tenant": "acme" } };

describe("languageModelFromProfile (custom gateway)", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("responses shape posts to /responses with store disabled", async () => {
    const calls = stubFetch(RESPONSES_REPLY);
    const { text } = await generateText({
      model: languageModelFromProfile(customProfile("responses"), secrets, "gw-model"),
      prompt: "ping",
    });

    assert.equal(text, "OK");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gw.example.com/v1/responses");
    assert.equal(calls[0].headers.get("x-tenant"), "acme");
    assert.equal(calls[0].body.store, false);
  });

  it("call-level openai options still merge over store: false", async () => {
    const calls = stubFetch(RESPONSES_REPLY);
    await generateText({
      model: languageModelFromProfile(customProfile("responses"), secrets, "gw-model"),
      prompt: "ping",
      providerOptions: { openai: { user: "u-1" } },
    });

    assert.equal(calls[0].body.store, false);
    assert.equal(calls[0].body.user, "u-1");
  });

  it("defaults to chat completions when apiShape is absent", async () => {
    const calls = stubFetch(CHAT_REPLY);
    const { text } = await generateText({
      model: languageModelFromProfile(customProfile(), secrets, "gw-model"),
      prompt: "ping",
    });

    assert.equal(text, "OK");
    assert.equal(calls[0].url, "https://gw.example.com/v1/chat/completions");
    assert.equal(calls[0].headers.get("x-tenant"), "acme");
  });
});
