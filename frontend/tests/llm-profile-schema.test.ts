import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LlmProfileConfigSchema,
  LlmProfileModelsSchema,
  LlmProfileSecretsSchema,
  maskSecret,
  requiredSecretKey,
  secretsPresence,
} from "@/lib/actions/llm-profiles/schema";

describe("LlmProfileConfigSchema", () => {
  it("accepts every api_key provider with an empty config", () => {
    for (const provider of [
      "openai_completions",
      "openai_responses",
      "anthropic",
      "gemini",
      "groq",
      "mistral",
    ] as const) {
      const parsed = LlmProfileConfigSchema.parse({ provider, config: { auth: { type: "api_key" } } });
      assert.equal(requiredSecretKey(parsed), "apiKey");
    }
  });

  it("bedrock requires a region and picks the secret from the auth tag", () => {
    const keys = LlmProfileConfigSchema.parse({
      provider: "bedrock",
      config: { region: "us-east-1", auth: { type: "aws_keys", accessKeyId: "AKIA" } },
    });
    assert.equal(requiredSecretKey(keys), "secretAccessKey");

    const bearer = LlmProfileConfigSchema.parse({
      provider: "bedrock",
      config: { region: "us-east-1", auth: { type: "bearer_token" } },
    });
    assert.equal(requiredSecretKey(bearer), "token");

    assert.ok(
      !LlmProfileConfigSchema.safeParse({ provider: "bedrock", config: { auth: { type: "bearer_token" } } }).success
    );
  });

  it("azure needs exactly one of resourceId / baseUrl", () => {
    const ok = (config: Record<string, unknown>) =>
      LlmProfileConfigSchema.safeParse({
        provider: "azure_responses",
        config: { ...config, auth: { type: "api_key" } },
      }).success;
    assert.ok(ok({ resourceId: "my-resource" }));
    assert.ok(ok({ baseUrl: "https://my-resource.openai.azure.com" }));
    assert.ok(!ok({}));
    assert.ok(!ok({ resourceId: "r", baseUrl: "https://x.example.com" }));
  });

  it("custom validates the base URL and header names", () => {
    const parsed = LlmProfileConfigSchema.parse({
      provider: "custom",
      config: { baseUrl: "https://gw.example.com/v1/", headerNames: ["X-Tenant"], auth: { type: "api_key" } },
    });
    assert.equal(parsed.provider, "custom");
    assert.equal(parsed.config.baseUrl, "https://gw.example.com/v1");

    const bad = (config: Record<string, unknown>) =>
      !LlmProfileConfigSchema.safeParse({ provider: "custom", config: { ...config, auth: { type: "api_key" } } })
        .success;
    assert.ok(bad({ baseUrl: "ftp://gw.example.com" }));
    assert.ok(bad({ baseUrl: "https://gw.example.com", headerNames: ["Bad Header"] }));
    assert.ok(bad({ baseUrl: "https://gw.example.com", headerNames: ["X-A", "x-a"] }));
  });

  it("rejects unknown providers", () => {
    assert.ok(!LlmProfileConfigSchema.safeParse({ provider: "cohere", config: { auth: { type: "api_key" } } }).success);
  });
});

describe("LlmProfileSecretsSchema", () => {
  it("rejects line breaks and empty values, redacts to presence markers", () => {
    assert.ok(!LlmProfileSecretsSchema.safeParse({ apiKey: "" }).success);
    assert.ok(!LlmProfileSecretsSchema.safeParse({ apiKey: "a\nb" }).success);
    assert.ok(!LlmProfileSecretsSchema.safeParse({ headers: { "Bad Header": "v" } }).success);

    const secrets = LlmProfileSecretsSchema.parse({
      apiKey: "sk-live-abcdef123456",
      headers: { "X-Tenant": "acme" },
    });
    assert.deepStrictEqual(secretsPresence(secrets), {
      apiKey: "sk-**************456",
      secretAccessKey: null,
      token: null,
      headers: ["X-Tenant"],
    });
  });

  it("fully masks values too short to show edges", () => {
    assert.equal(maskSecret("short-key"), "*********");
    assert.equal(maskSecret(undefined), null);
  });
});

describe("LlmProfileModelsSchema", () => {
  it("requires at least one unique, non-blank model", () => {
    assert.deepStrictEqual(LlmProfileModelsSchema.parse([" gpt-5 "]), ["gpt-5"]);
    assert.ok(!LlmProfileModelsSchema.safeParse([]).success);
    assert.ok(!LlmProfileModelsSchema.safeParse(["a", "a"]).success);
    assert.ok(!LlmProfileModelsSchema.safeParse([" "]).success);
  });
});
