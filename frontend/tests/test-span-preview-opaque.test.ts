import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tryHeuristicPreview } from "@/lib/actions/spans/previews/heuristic";
import { flattenPaths, isOpaqueString, validateMustacheKey } from "@/lib/actions/spans/previews/utils";

const ENCRYPTED_REASONING =
  "gAAAAABq337COZlmeksoUuRE8xCY9P0UwzkkOHD07Xk-FluS7X9wwq-pKEZSbDqqw-Ul6LJcnhs0h6VDCjqXoeSKp_sXmY2l";
const THOUGHT_SIGNATURE =
  "EmAKXgFpFH0TIxRbs9Z+xxQpzoFa99DQiIB6lHa2xoRKLcIWSDJhz5uDlP1sVi+pEw94b1SYsBWwYg6a/nd625gNwqEuGFl3";

const reasoning = { id: "rs_1", type: "reasoning", summary: [], content: [], encrypted_content: ENCRYPTED_REASONING };

describe("opaque span preview values", () => {
  it("isOpaqueString flags encoded payloads and keeps readable strings", () => {
    for (const v of [ENCRYPTED_REASONING, THOUGHT_SIGNATURE, "data:image/png;base64,iVBORw0KGgo="]) {
      assert.ok(isOpaqueString(v), v);
    }
    for (const v of [
      "Here are the practical factors to weigh for Paris vs Tokyo.",
      "https://docs.laminar.sh/tracing/integrations/openai-agents-sdk?ref=readme",
      "uploads/2026/10/26/User42/Reports/QuarterlySummaryFinal",
      "testUserCanLoginWithValidCredentials2FAEnabledAndRememberMe",
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    ]) {
      assert.ok(!isOpaqueString(v), v);
    }
  });

  it("heuristic never surfaces a blob", () => {
    assert.strictEqual(tryHeuristicPreview([reasoning]), null);
    assert.strictEqual(tryHeuristicPreview({ object: "response", output: [reasoning] }), null);
    assert.strictEqual(tryHeuristicPreview({ blob: THOUGHT_SIGNATURE }), null);
    const call = { type: "function_call", name: "get_flight_details", arguments: { flight_id: "FL-101" } };
    assert.strictEqual(tryHeuristicPreview([reasoning, call]), "get_flight_details");
  });

  it("templates that render only blobs are rejected, including cached ones", () => {
    assert.strictEqual(validateMustacheKey("{{#.}}{{{encrypted_content}}}\n{{/.}}", [reasoning, reasoning]), null);
    assert.strictEqual(validateMustacheKey("{{{city}}}", { city: "Tokyo" }), "Tokyo");
  });

  it("the LLM prompt hides blobs", () => {
    const paths = flattenPaths({ output: [reasoning], extra: THOUGHT_SIGNATURE });
    assert.ok(paths.includes("extra: string [meta]"));
    assert.ok(!/gAAAA|EmAKXg/.test(paths.join("\n")));
  });
});
