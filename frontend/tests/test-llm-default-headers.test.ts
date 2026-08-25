import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { describe, it } from "node:test";

import { generateText } from "ai";

import {
  azureOpenAIBaseUrl,
  foundryAnthropicBaseUrl,
  getLanguageModel,
  isAiProviderConfigured,
  parseLlmDefaultHeaders,
} from "@/lib/ai/model";

describe("parseLlmDefaultHeaders", () => {
  it("returns undefined when unset or blank", () => {
    assert.strictEqual(parseLlmDefaultHeaders(undefined), undefined);
    assert.strictEqual(parseLlmDefaultHeaders("  "), undefined);
  });

  it("parses a JSON object with string values", () => {
    assert.deepStrictEqual(parseLlmDefaultHeaders('{"X-Gateway-Tenant":"brex"}'), {
      "X-Gateway-Tenant": "brex",
    });
  });

  it("rejects non-object JSON", () => {
    assert.throws(() => parseLlmDefaultHeaders('["x"]'), /expected a JSON object/);
  });

  it("rejects non-string header values", () => {
    assert.throws(() => parseLlmDefaultHeaders('{"X-Gateway-Tenant":true}'), /value must be a string/);
  });

  it("rejects invalid header names and values", () => {
    assert.throws(() => parseLlmDefaultHeaders('{"Bad Header":"value"}'), /invalid header/);
    assert.throws(() => parseLlmDefaultHeaders('{"X-Gateway-Tenant":"bad\\nvalue"}'), /invalid header/);
  });

  it("does not report the provider configured when default headers are invalid", () => {
    const previousProvider = process.env.LLM_PROVIDER;
    const previousApiKey = process.env.LLM_API_KEY;
    const previousHeaders = process.env.LLM_DEFAULT_HEADERS_JSON;

    try {
      process.env.LLM_PROVIDER = "openai";
      process.env.LLM_API_KEY = "test-key";
      process.env.LLM_DEFAULT_HEADERS_JSON = '{"Bad Header":"value"}';

      assert.strictEqual(isAiProviderConfigured(), false);
    } finally {
      restoreEnv("LLM_PROVIDER", previousProvider);
      restoreEnv("LLM_API_KEY", previousApiKey);
      restoreEnv("LLM_DEFAULT_HEADERS_JSON", previousHeaders);
    }
  });
});

describe("azure_openai provider config", () => {
  it("normalizes every accepted endpoint form to the v1 route", () => {
    // createAzure appends /v1 itself for azure.com hosts, but not for gateways.
    assert.strictEqual(
      azureOpenAIBaseUrl("https://my-resource.openai.azure.com/"),
      "https://my-resource.openai.azure.com/openai"
    );
    assert.strictEqual(
      azureOpenAIBaseUrl("https://my-resource.openai.azure.com/openai/v1"),
      "https://my-resource.openai.azure.com/openai"
    );
    assert.strictEqual(
      azureOpenAIBaseUrl("https://gateway.internal/azure"),
      "https://gateway.internal/azure/openai/v1"
    );
  });

  it("rejects an endpoint that is not an absolute URL", () => {
    assert.throws(() => azureOpenAIBaseUrl("my-resource.openai.azure.com"), /not an absolute URL/);
  });

  it("requires a non-blank endpoint on top of the api key", () => {
    const previous = {
      provider: process.env.LLM_PROVIDER,
      apiKey: process.env.LLM_API_KEY,
      resourceId: process.env.AZURE_OPENAI_RESOURCE_ID,
    };

    try {
      process.env.LLM_PROVIDER = "azure_openai";
      process.env.LLM_API_KEY = "test-key";
      process.env.AZURE_OPENAI_RESOURCE_ID = "  ";
      assert.strictEqual(isAiProviderConfigured(), false);

      process.env.AZURE_OPENAI_RESOURCE_ID = "my-resource";
      assert.strictEqual(isAiProviderConfigured(), true);
    } finally {
      restoreEnv("LLM_PROVIDER", previous.provider);
      restoreEnv("LLM_API_KEY", previous.apiKey);
      restoreEnv("AZURE_OPENAI_RESOURCE_ID", previous.resourceId);
    }
  });
});

describe("foundry_anthropic provider config", () => {
  it("normalizes every accepted endpoint form to the anthropic v1 route", () => {
    assert.strictEqual(
      foundryAnthropicBaseUrl("https://my-resource.services.ai.azure.com/"),
      "https://my-resource.services.ai.azure.com/anthropic/v1"
    );
    assert.strictEqual(
      foundryAnthropicBaseUrl("https://my-resource.services.ai.azure.com/anthropic/v1"),
      "https://my-resource.services.ai.azure.com/anthropic/v1"
    );
  });

  // Foundry 401s on `api-key` and wants `x-api-key`; this drives a real request
  // to prove the header the app-server sends is the one that goes out here too.
  it("sends x-api-key to the anthropic messages route", async () => {
    let captured: { url?: string; headers?: IncomingMessage["headers"] } = {};
    const server: Server = createServer((req, res) => {
      captured = { url: req.url, headers: req.headers };
      req.resume();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "my-deployment",
          content: [{ type: "text", text: "pong" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 3, output_tokens: 1 },
        })
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const previous = {
      provider: process.env.LLM_PROVIDER,
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.FOUNDRY_ANTHROPIC_BASE_URL,
      large: process.env.LLM_MODEL_LARGE,
    };

    try {
      process.env.LLM_PROVIDER = "foundry_anthropic";
      process.env.LLM_API_KEY = "foundry-test-key";
      process.env.FOUNDRY_ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
      process.env.LLM_MODEL_LARGE = "my-deployment";

      const result = await generateText({ model: getLanguageModel("large"), prompt: "ping" });

      assert.strictEqual(result.text, "pong");
      assert.strictEqual(captured.url, "/anthropic/v1/messages");
      assert.strictEqual(captured.headers?.["x-api-key"], "foundry-test-key");
      assert.strictEqual(captured.headers?.["anthropic-version"], "2023-06-01");
    } finally {
      restoreEnv("LLM_PROVIDER", previous.provider);
      restoreEnv("LLM_API_KEY", previous.apiKey);
      restoreEnv("FOUNDRY_ANTHROPIC_BASE_URL", previous.baseUrl);
      restoreEnv("LLM_MODEL_LARGE", previous.large);
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
