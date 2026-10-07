import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDefaultValues, buildRequestBody } from "@/components/workspace/llm-profiles/build-values";
import { sameProviderFamily } from "@/components/workspace/llm-profiles/types";
import { type LlmProfile } from "@/lib/actions/llm-profiles/schema";

const gateway = (provider: "custom" | "custom_responses"): LlmProfile => ({
  id: "p1",
  workspaceId: "w1",
  name: "gateway",
  provider,
  config: { baseUrl: "https://gw.example.com/v1", headerNames: ["X-Tenant"], auth: { type: "api_key" } },
  models: ["gw-model"],
  secrets: { apiKey: "sk-***key", secretAccessKey: null, token: null, headers: ["X-Tenant"] },
  createdAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
});

describe("custom gateway profile form", () => {
  it("round-trips the API shape through the form", () => {
    for (const provider of ["custom", "custom_responses"] as const) {
      const values = buildDefaultValues(gateway(provider));
      assert.equal(values.uiProvider, "custom");
      assert.equal(values.customShape, provider);

      const body = buildRequestBody({ ...values, headers: [{ name: "X-Tenant", value: "acme" }] });
      assert.equal(body.profile.provider, provider);
      assert.deepStrictEqual(body.profile.config, {
        auth: { type: "api_key" },
        baseUrl: "https://gw.example.com/v1",
        headerNames: ["X-Tenant"],
      });
      assert.deepStrictEqual(body.secrets.headers, { "X-Tenant": "acme" });
    }
  });

  it("keeps stored secrets when only the API shape changes", () => {
    const values = { ...buildDefaultValues(gateway("custom")), customShape: "custom_responses" as const };
    assert.ok(sameProviderFamily(values, gateway("custom")));
    assert.equal(buildRequestBody(values).profile.provider, "custom_responses");
  });
});
