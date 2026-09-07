import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { generateText } from "ai";

import { getModel } from "@/lib/playground/providersRegistry";

const originalFetch = globalThis.fetch;
const originalBaseURL = process.env.MINIMAX_BASE_URL;

const modelIds = ["MiniMax-M3", "MiniMax-M2.7"] as const;
const endpointCases = [
  {
    name: "global OpenAI",
    baseURL: "https://api.minimax.io/v1",
    requestURL: "https://api.minimax.io/v1/chat/completions",
    protocol: "openai",
  },
  {
    name: "China OpenAI",
    baseURL: "https://api.minimaxi.com/v1",
    requestURL: "https://api.minimaxi.com/v1/chat/completions",
    protocol: "openai",
  },
  {
    name: "global Anthropic",
    baseURL: "https://api.minimax.io/anthropic",
    requestURL: "https://api.minimax.io/anthropic/v1/messages",
    protocol: "anthropic",
  },
  {
    name: "China Anthropic",
    baseURL: "https://api.minimaxi.com/anthropic",
    requestURL: "https://api.minimaxi.com/anthropic/v1/messages",
    protocol: "anthropic",
  },
] as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBaseURL === undefined) {
    delete process.env.MINIMAX_BASE_URL;
  } else {
    process.env.MINIMAX_BASE_URL = originalBaseURL;
  }
});

for (const endpoint of endpointCases) {
  for (const modelId of modelIds) {
    test(`${modelId} uses the ${endpoint.name} endpoint`, async () => {
      process.env.MINIMAX_BASE_URL = endpoint.baseURL;

      let capturedRequest: Request | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedRequest = new Request(input, init);

        const responseBody =
          endpoint.protocol === "anthropic"
            ? {
                id: "msg_test",
                type: "message",
                role: "assistant",
                model: modelId,
                content: [{ type: "text", text: "ok" }],
                stop_reason: "end_turn",
                stop_sequence: null,
                usage: { input_tokens: 1, output_tokens: 1 },
              }
            : {
                id: "chatcmpl-test",
                object: "chat.completion",
                created: 0,
                model: modelId,
                choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
              };

        return new Response(JSON.stringify(responseBody), {
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;

      const result = await generateText({
        model: getModel(`minimax:${modelId}`, "test-api-key"),
        prompt: "Hello",
      });

      assert.equal(result.text, "ok");
      assert.ok(capturedRequest);
      assert.equal(capturedRequest.url, endpoint.requestURL);

      const body = (await capturedRequest.json()) as { model: string };
      assert.equal(body.model, modelId);
      assert.equal(
        capturedRequest.headers.get(endpoint.protocol === "anthropic" ? "x-api-key" : "authorization"),
        endpoint.protocol === "anthropic" ? "test-api-key" : "Bearer test-api-key"
      );
    });
  }
}
