import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupTarget, unsetHint } from "@/components/workspace/llm-feature-routes/utils";
import { DEFAULT_FEATURE_GROUP_ID, featureGroupLabels, LLM_FEATURE_GROUPS } from "@/lib/ai/feature-groups";
import { DEFAULT_LLM_FEATURE_ID } from "@/lib/ai/features";

const route = (featureId: string, llmProfileId = "p1", model = "m1") => ({ featureId, llmProfileId, model });

describe("groupTarget", () => {
  const ids = ["span_preview_prompts", "span_preview_agent_names"];

  it("is unset when no id has a row", () => {
    assert.equal(groupTarget(ids, [route("sql_generation")]), null);
  });

  it("is the shared target when every id points at the same profile and model", () => {
    const routes = ids.map((id) => route(id));
    assert.deepEqual(groupTarget(ids, routes), { llmProfileId: "p1", model: "m1" });
  });

  it("is mixed when only some ids have a row", () => {
    assert.equal(groupTarget(ids, [route(ids[0])]), undefined);
  });

  it("is mixed when the rows disagree", () => {
    assert.equal(groupTarget(ids, [route(ids[0]), route(ids[1], "p1", "m2")]), undefined);
  });
});

describe("unsetHint", () => {
  it("points unset groups at Default", () => {
    assert.equal(unsetHint(false, false), "Uses Default.");
  });

  it("points an unset Default at env vars, or says nothing is configured", () => {
    assert.match(unsetHint(true, true), /LLM_PROVIDER/);
    assert.match(unsetHint(true, false), /No LLM configured/);
  });
});

describe("LLM_FEATURE_GROUPS", () => {
  it("routes each feature id from exactly one group", () => {
    const ids = LLM_FEATURE_GROUPS.flatMap((g) => g.featureIds);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("keeps the Default group on the table-level default id", () => {
    const group = LLM_FEATURE_GROUPS.find((g) => g.id === DEFAULT_FEATURE_GROUP_ID);
    assert.deepEqual(group?.featureIds, [DEFAULT_LLM_FEATURE_ID]);
  });

  it("leaves signals to the per-signal picker", () => {
    const ids = LLM_FEATURE_GROUPS.flatMap((g) => g.featureIds);
    assert.ok(!ids.some((id) => id.startsWith("signals")));
  });

  it("names the groups that use a set of feature ids", () => {
    assert.deepEqual(featureGroupLabels(["clustering_naming", "sql_generation"]), ["Naming", "SQL & templates"]);
  });
});
