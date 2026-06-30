import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAiProviderConfigured, parseLlmDefaultHeaders } from "@/lib/ai/model";

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

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
